import type { InterviewId, ProblemId, UserId } from "./ids.js";
import type {
  Interview,
  InterviewConfiguration,
  InterviewStatus,
} from "./interview.js";
import { createInterview, currentProblemRef } from "./interview.js";
import { transition } from "./lifecycle.js";
import type { ResponseKind } from "./candidate-response.js";
import { createCandidateResponse } from "./candidate-response.js";
import type { CreateEvaluationInput } from "./evaluation.js";
import { createEvaluation } from "./evaluation.js";
import type { Evaluation } from "./evaluation.js";
import type { InterviewEventType } from "./interview-event.js";
import { buildEvent } from "./interview-event.js";
import type { Problem } from "./problem.js";
import type { RepositorySet } from "./repositories.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface InterviewServiceDeps extends RepositorySet {
  readonly clock?: Clock;
}

export interface CreateInterviewArgs {
  readonly candidateId: UserId;
  readonly configuration: InterviewConfiguration;
}

export interface RecordResponseArgs {
  readonly problemId?: ProblemId;
  readonly kind: ResponseKind;
  readonly content: string;
}

export interface InterviewStateSnapshot {
  readonly interview: Interview;
  readonly currentProblem: Problem | null;
  readonly responseCount: number;
  readonly evaluation: Evaluation | null;
}

// Backend-owned interview lifecycle (HLD 1.2/1.3). Every mutation goes
// through lifecycle.transition, so illegal jumps are rejected uniformly.
// Persistence-agnostic: runs on RepositorySet (in-memory in S1,
// Drizzle/Postgres in S2).
export class InterviewService {
  private readonly repos: RepositorySet;
  private readonly clock: Clock;

  constructor(deps: InterviewServiceDeps) {
    const { clock, ...repos } = deps;
    this.repos = repos;
    this.clock = clock ?? systemClock;
  }

  async createInterview(args: CreateInterviewArgs): Promise<Result<Interview>> {
    const created = createInterview({
      candidateId: args.candidateId,
      configuration: args.configuration,
      now: this.clock.now(),
    });
    if (!created.ok) return created;
    await this.repos.interviews.save(created.value);
    await this.recordEvent(created.value.id, "interview.created");
    return created;
  }

  async markReady(id: InterviewId): Promise<Result<Interview>> {
    return this.move(id, "ready", "interview.ready");
  }

  async start(id: InterviewId): Promise<Result<Interview>> {
    return this.move(id, "in_progress", "interview.started");
  }

  async pause(id: InterviewId): Promise<Result<Interview>> {
    return this.move(id, "paused", "interview.paused");
  }

  async resume(id: InterviewId): Promise<Result<Interview>> {
    return this.move(id, "in_progress", "interview.resumed");
  }

  async beginCompleting(id: InterviewId): Promise<Result<Interview>> {
    return this.move(id, "completing", "interview.completing");
  }

  async complete(id: InterviewId): Promise<Result<Interview>> {
    return this.move(id, "completed", "interview.completed");
  }

  async cancel(
    id: InterviewId,
    reason?: string,
  ): Promise<Result<Interview>> {
    return this.move(
      id,
      "cancelled",
      "interview.cancelled",
      reason === undefined ? undefined : { reason },
    );
  }

  async fail(id: InterviewId, reason?: string): Promise<Result<Interview>> {
    return this.move(
      id,
      "failed",
      "interview.failed",
      reason === undefined ? undefined : { reason },
    );
  }

  // Assign the ordered problem set. Allowed in created/ready so the
  // interview is fully configured before it starts. Replaces any prior
  // assignment; the first problem becomes active.
  async assignProblems(
    id: InterviewId,
    problemIds: readonly ProblemId[],
  ): Promise<Result<Interview>> {
    const interview = await this.repos.interviews.findById(id);
    if (interview === null) return err(this.notFound(id));
    if (interview.status !== "created" && interview.status !== "ready") {
      return err(
        domainError(
          "ILLEGAL_TRANSITION",
          `Cannot assign problems while interview ${id} is ${interview.status}`,
          { status: interview.status },
        ),
      );
    }
    const problems = await this.repos.problems.findManyByIds(problemIds);
    if (problems.length !== problemIds.length) {
      const found = new Set(problems.map((p) => p.id));
      const missing = problemIds.filter((pid) => !found.has(pid));
      return err(
        domainError("NOT_FOUND", "One or more problems do not exist", {
          missing,
        }),
      );
    }
    const now = this.clock.now();
    const assigned = problemIds.map((problemId, order) => ({
      interviewId: id,
      problemId,
      order,
      state:
        order === 0 ? ("active" as const) : ("assigned" as const),
    }));
    const next: Interview = {
      ...interview,
      problems: assigned,
      currentOrder: assigned.length > 0 ? 0 : null,
      updatedAt: now,
    };
    await this.repos.interviews.save(next);
    await this.recordEvent(id, "problem.assigned", {
      count: assigned.length,
    });
    return ok(next);
  }

  // Switch the actively discussed problem. Allowed once the interview is
  // configured (ready) or running (in_progress/paused).
  async setCurrentProblem(
    id: InterviewId,
    problemId: ProblemId,
  ): Promise<Result<Interview>> {
    const interview = await this.repos.interviews.findById(id);
    if (interview === null) return err(this.notFound(id));
    if (
      interview.status !== "ready" &&
      interview.status !== "in_progress" &&
      interview.status !== "paused"
    ) {
      return err(
        domainError(
          "ILLEGAL_TRANSITION",
          `Cannot switch problem while interview ${id} is ${interview.status}`,
          { status: interview.status },
        ),
      );
    }
    const target = interview.problems.find((p) => p.problemId === problemId);
    if (target === undefined) {
      return err(
        domainError(
          "NOT_FOUND",
          `Problem ${problemId} is not assigned to interview ${id}`,
          { problemId },
        ),
      );
    }
    const now = this.clock.now();
    const next: Interview = {
      ...interview,
      problems: interview.problems.map((p) => {
        if (p.problemId === problemId) return { ...p, state: "active" as const };
        return p.state === "active" ? { ...p, state: "assigned" as const } : p;
      }),
      currentOrder: target.order,
      updatedAt: now,
    };
    await this.repos.interviews.save(next);
    await this.recordEvent(id, "problem.activated", {
      problemId,
      order: target.order,
    });
    return ok(next);
  }

  async recordResponse(
    id: InterviewId,
    args: RecordResponseArgs,
  ): Promise<Result<Interview>> {
    const interview = await this.repos.interviews.findById(id);
    if (interview === null) return err(this.notFound(id));
    if (interview.status !== "in_progress" && interview.status !== "paused") {
      return err(
        domainError(
          "ILLEGAL_TRANSITION",
          `Cannot record response while interview ${id} is ${interview.status}`,
          { status: interview.status },
        ),
      );
    }
    const current = currentProblemRef(interview);
    const problemId = args.problemId ?? current?.problemId ?? undefined;
    const created = createCandidateResponse({
      interviewId: id,
      kind: args.kind,
      content: args.content,
      now: this.clock.now(),
      ...(problemId === undefined ? {} : { problemId }),
    });
    if (!created.ok) return created;
    await this.repos.responses.append(created.value);
    await this.recordEvent(id, "response.recorded", { kind: args.kind });
    const next: Interview = { ...interview, updatedAt: this.clock.now() };
    await this.repos.interviews.save(next);
    return ok(next);
  }

  async recordEvaluation(
    id: InterviewId,
    input: Omit<CreateEvaluationInput, "interviewId">,
  ): Promise<Result<Evaluation>> {
    const interview = await this.repos.interviews.findById(id);
    if (interview === null) return err(this.notFound(id));
    if (
      interview.status !== "in_progress" &&
      interview.status !== "paused" &&
      interview.status !== "completing"
    ) {
      return err(
        domainError(
          "ILLEGAL_TRANSITION",
          `Cannot record evaluation while interview ${id} is ${interview.status}`,
          { status: interview.status },
        ),
      );
    }
    const created = createEvaluation({
      ...input,
      interviewId: id,
      now: this.clock.now(),
    });
    if (!created.ok) return created;
    await this.repos.evaluations.save(created.value);
    await this.recordEvent(id, "evaluation.recorded");
    return created;
  }

  async getState(id: InterviewId): Promise<Result<InterviewStateSnapshot>> {
    const interview = await this.repos.interviews.findById(id);
    if (interview === null) return err(this.notFound(id));
    const ref = currentProblemRef(interview);
    const currentProblem =
      ref === null
        ? null
        : await this.repos.problems.findById(ref.problemId);
    const responses = await this.repos.responses.listByInterview(id);
    const evaluation = await this.repos.evaluations.findByInterview(id);
    return ok({
      interview,
      currentProblem,
      responseCount: responses.length,
      evaluation,
    });
  }

  private async move(
    id: InterviewId,
    to: InterviewStatus,
    eventType: InterviewEventType,
    payload?: Record<string, unknown>,
  ): Promise<Result<Interview>> {
    const interview = await this.repos.interviews.findById(id);
    if (interview === null) return err(this.notFound(id));
    const next = transition(interview, to, this.clock.now());
    if (!next.ok) return next;
    await this.repos.interviews.save(next.value);
    await this.recordEvent(id, eventType, payload);
    return next;
  }

  private async recordEvent(
    interviewId: InterviewId,
    type: InterviewEventType,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.repos.events.append(
      buildEvent(interviewId, type, this.clock.now(), payload),
    );
  }

  private notFound(id: InterviewId) {
    return domainError("NOT_FOUND", `Interview ${id} does not exist`, { id });
  }
}
