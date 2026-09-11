import type { InterviewId } from "./ids.js";
import type { EvaluationRecommendation } from "./evaluation.js";
import type {
  InterviewService,
  InterviewStateSnapshot,
} from "./interview-service.js";
import type { InterviewStatus } from "./interview.js";
import type { Problem } from "./problem.js";
import type { ResponseKind } from "./candidate-response.js";
import type { EventRepository, ResponseRepository } from "./repositories.js";
import type { Clock } from "./interview-service.js";
import { systemClock } from "./interview-service.js";
import { buildEvent } from "./interview-event.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Narrow domain tools: the model/app boundary (HLD 5.5, frozen section 4).
// Tools read backend-owned state or request app-only transitions; they never
// expose generic DB access and never let model output become canonical state.
//
// call_id deduplication and transport retries live in the S3 voice-service
// forwarder; execution here is deterministic so replays are safe.
export type ToolName =
  | "get_current_problem"
  | "get_interview_state"
  | "get_candidate_performance"
  | "end_interview";

export interface ToolContext {
  readonly interviewId: InterviewId;
  readonly callId: string;
}

export interface CurrentProblemResult {
  readonly problem: Problem | null;
}

export interface InterviewStateResult {
  readonly status: InterviewStatus;
  readonly currentProblemId: string | null;
  readonly problemCount: number;
  readonly responseCount: number;
  readonly startedAt: string | null;
  readonly updatedAt: string;
}

export interface CandidatePerformanceResult {
  readonly responseCount: number;
  readonly byKind: Record<ResponseKind, number>;
  readonly hintsUsed: number;
  readonly hasEvaluation: boolean;
  readonly recommendation: EvaluationRecommendation | null;
}

export interface EndInterviewResult {
  readonly status: InterviewStatus;
  readonly transitioned: boolean;
}

export type ToolResult =
  | CurrentProblemResult
  | InterviewStateResult
  | CandidatePerformanceResult
  | EndInterviewResult;

export interface ToolServiceDeps {
  readonly interviews: InterviewService;
  readonly responses: ResponseRepository;
  readonly events: EventRepository;
  readonly clock?: Clock;
}

export class ToolService {
  private readonly interviews: InterviewService;
  private readonly responses: ResponseRepository;
  private readonly events: EventRepository;
  private readonly clock: Clock;

  constructor(deps: ToolServiceDeps) {
    this.interviews = deps.interviews;
    this.responses = deps.responses;
    this.events = deps.events;
    this.clock = deps.clock ?? systemClock;
  }

  async dispatch(name: ToolName, ctx: ToolContext): Promise<Result<ToolResult>> {
    await this.events.append(
      buildEvent(ctx.interviewId, "tool.invoked", this.clock.now(), {
        tool: name,
        callId: ctx.callId,
      }),
    );
    let result: Result<ToolResult>;
    switch (name) {
      case "get_current_problem":
        result = await this.getCurrentProblem(ctx);
        break;
      case "get_interview_state":
        result = await this.getInterviewState(ctx);
        break;
      case "get_candidate_performance":
        result = await this.getCandidatePerformance(ctx);
        break;
      case "end_interview":
        result = await this.endInterview(ctx);
        break;
    }
    if (!result.ok) {
      await this.events.append(
        buildEvent(ctx.interviewId, "tool.failed", this.clock.now(), {
          tool: name,
          callId: ctx.callId,
          code: result.error.code,
        }),
      );
    }
    return result;
  }

  async getCurrentProblem(
    ctx: ToolContext,
  ): Promise<Result<CurrentProblemResult>> {
    const state = await this.interviews.getState(ctx.interviewId);
    if (!state.ok) return state;
    if (state.value.currentProblem === null) {
      return err(
        domainError(
          "NO_CURRENT_PROBLEM",
          `Interview ${ctx.interviewId} has no active problem`,
          { interviewId: ctx.interviewId },
        ),
      );
    }
    return ok({ problem: state.value.currentProblem });
  }

  async getInterviewState(
    ctx: ToolContext,
  ): Promise<Result<InterviewStateResult>> {
    const state = await this.interviews.getState(ctx.interviewId);
    if (!state.ok) return state;
    return ok(toStateResult(state.value));
  }

  async getCandidatePerformance(
    ctx: ToolContext,
  ): Promise<Result<CandidatePerformanceResult>> {
    const state = await this.interviews.getState(ctx.interviewId);
    if (!state.ok) return state;
    const responses = await this.responses.listByInterview(ctx.interviewId);
    const byKind: Record<ResponseKind, number> = {
      answer: 0,
      approach: 0,
      code: 0,
      question: 0,
      note: 0,
    };
    for (const response of responses) {
      byKind[response.kind] += 1;
    }
    const evaluation = state.value.evaluation;
    return ok({
      responseCount: responses.length,
      byKind,
      hintsUsed: evaluation?.hintsUsed ?? 0,
      hasEvaluation: evaluation !== null,
      recommendation: evaluation?.recommendation ?? null,
    });
  }

  // Model signals "done"; the app moves in_progress/paused -> completing.
  // Idempotent for completing/completed so retried calls are safe.
  async endInterview(ctx: ToolContext): Promise<Result<EndInterviewResult>> {
    const state = await this.interviews.getState(ctx.interviewId);
    if (!state.ok) return state;
    const status = state.value.interview.status;
    if (status === "completing" || status === "completed") {
      return ok({ status, transitioned: false });
    }
    if (status !== "in_progress" && status !== "paused") {
      return err(
        domainError(
          "ILLEGAL_TRANSITION",
          `Cannot end interview ${ctx.interviewId} while ${status}`,
          { status },
        ),
      );
    }
    const next = await this.interviews.beginCompleting(ctx.interviewId);
    if (!next.ok) return next;
    return ok({ status: next.value.status, transitioned: true });
  }
}

function toStateResult(snapshot: InterviewStateSnapshot): InterviewStateResult {
  const interview = snapshot.interview;
  return {
    status: interview.status,
    currentProblemId: snapshot.currentProblem?.id ?? null,
    problemCount: interview.problems.length,
    responseCount: snapshot.responseCount,
    startedAt: interview.startedAt?.toISOString() ?? null,
    updatedAt: interview.updatedAt.toISOString(),
  };
}
