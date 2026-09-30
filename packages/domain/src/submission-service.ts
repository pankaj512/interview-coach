import type { InterviewId, ProblemId, SubmissionId } from "./ids.js";
import { asProblemId } from "./ids.js";
import type {
  CodeExecutor,
  CodeRun,
  CodeSubmission,
  ExecutionSummary,
  RunLimits,
  RunProblemContext,
  RunTestCase,
} from "./submission.js";
import {
  assembleErrorRun,
  assembleRun,
  createSubmission,
  parseRunLimits,
  parseTestCases,
  summarizeRun,
} from "./submission.js";
import type {
  EventRepository,
  RunRepository,
  SubmissionRepository,
} from "./repositories.js";
import type { InterviewService } from "./interview-service.js";
import type { Clock } from "./interview-service.js";
import { systemClock } from "./interview-service.js";
import { buildEvent } from "./interview-event.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// S7a sandbox service (HLD 6.1-6.3): candidate code submissions + test runs.
// Submissions are validated source text; runs execute through the injected
// CodeExecutor port (backend local runner) and persist as CodeRuns. Runner
// crashes become `error` runs - never thrown - so tool-exec replays stay safe.
export interface SubmitCodeArgs {
  readonly language: string;
  readonly code: string;
  readonly problemId?: string;
}

export interface SubmissionServiceDeps {
  readonly interviews: InterviewService;
  readonly submissions: SubmissionRepository;
  readonly runs: RunRepository;
  readonly events: EventRepository;
  readonly executor: CodeExecutor;
  readonly clock?: Clock;
  // F6-3: sandbox quotas live here (single enforcement point) so the model
  // tool path cannot bypass what the HTTP routes enforce.
  readonly maxConcurrentRuns?: number;
  readonly maxSubmissionsPerInterview?: number;
}

const SUBMITTABLE = ["ready", "in_progress", "paused", "completing"] as const;

export class SubmissionService {
  private readonly interviews: InterviewService;
  private readonly submissions: SubmissionRepository;
  private readonly runs: RunRepository;
  private readonly events: EventRepository;
  private readonly executor: CodeExecutor;
  private readonly clock: Clock;
  private readonly maxConcurrentRuns: number | undefined;
  private readonly maxSubmissionsPerInterview: number | undefined;
  private activeRuns = 0;

  constructor(deps: SubmissionServiceDeps) {
    this.interviews = deps.interviews;
    this.submissions = deps.submissions;
    this.runs = deps.runs;
    this.events = deps.events;
    this.executor = deps.executor;
    this.clock = deps.clock ?? systemClock;
    this.maxConcurrentRuns = deps.maxConcurrentRuns;
    this.maxSubmissionsPerInterview = deps.maxSubmissionsPerInterview;
  }

  async submit(
    interviewId: InterviewId,
    args: SubmitCodeArgs,
  ): Promise<Result<CodeSubmission>> {
    const state = await this.interviews.getState(interviewId);
    if (!state.ok) return state;
    const status = state.value.interview.status;
    if (!(SUBMITTABLE as readonly string[]).includes(status)) {
      return err(
        domainError(
          "ILLEGAL_TRANSITION",
          `Cannot submit code while interview ${interviewId} is ${status}`,
          { status },
        ),
      );
    }
    // F6-3: per-interview submission cap (shared by route and tool path).
    if (this.maxSubmissionsPerInterview !== undefined) {
      const existing = await this.submissions.listByInterview(interviewId);
      if (existing.length >= this.maxSubmissionsPerInterview) {
        return err(
          domainError(
            "RATE_LIMITED",
            `Submission limit reached (max ${this.maxSubmissionsPerInterview})`,
            { interviewId },
          ),
        );
      }
    }
    let problemId: ProblemId | undefined;
    if (args.problemId !== undefined) {
      if (args.problemId.trim() === "") {
        return err(
          domainError("VALIDATION_ERROR", "problemId must be a non-empty string"),
        );
      }
      problemId = asProblemId(args.problemId);
      // F6-6: a submission may only reference a problem assigned to this
      // interview (backend owns truth).
      if (!state.value.interview.problems.some((p) => p.problemId === problemId)) {
        return err(
          domainError(
            "NOT_FOUND",
            `Problem ${args.problemId} is not assigned to interview ${interviewId}`,
            { problemId: args.problemId },
          ),
        );
      }
    }
    const created = createSubmission({
      interviewId,
      language: args.language,
      code: args.code,
      now: this.clock.now(),
      ...(problemId === undefined ? {} : { problemId }),
    });
    if (!created.ok) return created;
    await this.submissions.save(created.value);
    await this.events.append(
      buildEvent(interviewId, "code.submitted", this.clock.now(), {
        submissionId: created.value.id,
        language: created.value.language,
      }),
    );
    return created;
  }

  async listSubmissions(
    interviewId: InterviewId,
  ): Promise<Result<readonly CodeSubmission[]>> {
    const state = await this.interviews.getState(interviewId);
    if (!state.ok) return state;
    return ok(await this.submissions.listByInterview(interviewId));
  }

  async latestSubmission(
    interviewId: InterviewId,
  ): Promise<Result<CodeSubmission | null>> {
    const listed = await this.listSubmissions(interviewId);
    if (!listed.ok) return listed;
    const all = listed.value;
    return ok(all.length === 0 ? null : (all[all.length - 1] ?? null));
  }

  async runTests(
    submissionId: SubmissionId,
    testCasesRaw: unknown,
    timeoutMsRaw?: unknown,
    context?: RunProblemContext,
  ): Promise<Result<CodeRun>> {
    const submission = await this.submissions.findById(submissionId);
    if (submission === null) {
      return err(
        domainError(
          "NOT_FOUND",
          `Submission ${submissionId} does not exist`,
          { submissionId },
        ),
      );
    }
    const state = await this.interviews.getState(submission.interviewId);
    if (!state.ok) return state;
    const status = state.value.interview.status;
    if (!(SUBMITTABLE as readonly string[]).includes(status)) {
      return err(
        domainError(
          "ILLEGAL_TRANSITION",
          `Cannot run code while interview ${submission.interviewId} is ${status}`,
          { status },
        ),
      );
    }
    const cases = parseTestCases(testCasesRaw);
    if (!cases.ok) return cases;
    const limits = parseRunLimits(timeoutMsRaw);
    if (!limits.ok) return limits;
    // F6-3: process-wide concurrent-run cap (shared by route and tool path).
    if (
      this.maxConcurrentRuns !== undefined &&
      this.activeRuns >= this.maxConcurrentRuns
    ) {
      return err(
        domainError(
          "RATE_LIMITED",
          `Code runner busy (${this.activeRuns}/${this.maxConcurrentRuns} running); retry shortly`,
        ),
      );
    }
    const startedAt = Date.now();
    let run: CodeRun;
    this.activeRuns += 1;
    try {
      const outcome = await this.executor.execute(
        submission,
        cases.value,
        limits.value,
        ...(context === undefined ? [] : [context]),
      );
      run = assembleRun(submission, cases.value, outcome, this.clock.now());
    } catch (error) {
      run = assembleErrorRun(
        submission,
        cases.value,
        runnerMessage(error),
        Date.now() - startedAt,
        this.clock.now(),
      );
    } finally {
      this.activeRuns -= 1;
    }
    await this.runs.save(run);
    await this.events.append(
      buildEvent(submission.interviewId, "code.executed", this.clock.now(), {
        runId: run.id,
        submissionId: submission.id,
        status: run.status,
        passed: run.passedCount,
        total: run.totalCount,
      }),
    );
    return ok(run);
  }

  async listRuns(
    interviewId: InterviewId,
  ): Promise<Result<readonly CodeRun[]>> {
    const state = await this.interviews.getState(interviewId);
    if (!state.ok) return state;
    return ok(await this.runs.listByInterview(interviewId));
  }

  async latestSummary(
    interviewId: InterviewId,
  ): Promise<Result<ExecutionSummary | null>> {
    const runs = await this.listRuns(interviewId);
    if (!runs.ok) return runs;
    const all = runs.value;
    if (all.length === 0) return ok(null);
    const latest = all[all.length - 1];
    if (latest === undefined) return ok(null);
    return ok(summarizeRun(latest));
  }

  async runCount(interviewId: InterviewId): Promise<number> {
    return (await this.runs.listByInterview(interviewId)).length;
  }

  async submissionCount(interviewId: InterviewId): Promise<number> {
    return (await this.submissions.listByInterview(interviewId)).length;
  }
}

function runnerMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Runner failed";
  return message.length <= 2000 ? message : `${message.slice(0, 2000)}...`;
}
