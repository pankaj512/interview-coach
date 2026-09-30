import type { InterviewId, ProblemId } from "./ids.js";
import { asProblemId, asSubmissionId } from "./ids.js";
import type { Evaluation, EvaluationRecommendation } from "./evaluation.js";
import type {
  InterviewService,
  InterviewStateSnapshot,
} from "./interview-service.js";
import type { InterviewConfiguration, InterviewStatus } from "./interview.js";
import type { Problem } from "./problem.js";
import type { ResponseKind } from "./candidate-response.js";
import { MAX_RESPONSE_CONTENT_LENGTH } from "./candidate-response.js";
import type {
  EvaluationRepository,
  EventRepository,
  ResponseRepository,
} from "./repositories.js";
import type { RunStatus } from "./submission.js";
import type { SubmissionService } from "./submission-service.js";
import type { Clock } from "./interview-service.js";
import { systemClock } from "./interview-service.js";
import { buildEvent } from "./interview-event.js";
import { buildHint, nextHintLevel, parseHintLevel } from "./hints.js";
import type { HintLevel } from "./hints.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Narrow domain tools: the model/app boundary (HLD 5.5, frozen section 4).
// Tools read backend-owned state or request app-only transitions; they never
// expose generic DB access and never let model output become canonical state.
//
// call_id deduplication and transport retries live in the S3 voice-service
// forwarder; execution here is deterministic so replays are safe.
//
// S5 adds three tools from the frozen "later" list (section 4):
// get_interview_configuration (structured context), get_problem_hint
// (controlled 3-tier hints, never the solution), record_candidate_answer
// (model-observed answers become persisted responses).
//
// S7a adds the first two Phase 6 sandbox tools: submit_solution (persist
// candidate code as backend-owned state) and run_code (execute the latest
// or a named submission against caller-supplied cases). evaluate_solution
// scoring policy stays open for S7b; runs are persisted and surfaced via
// get_candidate_performance meanwhile.
//
// Phase 8 (ADR-002 decision 11, roadmap micro-item 1) collapses the surface to
// four canonical tools. New code/docs use only these:
//   - get_current_interview: interview + configuration + candidate context
//   - get_current_problem
//   - submit_interview_data: candidate answers/notes + code submissions
//   - end_interview
// The pre-Phase-8 names stay accepted as DEPRECATED ALIASES (CLI-harness
// compatibility) and keep their original result shapes; they are never
// advertised to the web model. Hints are model-driven conversation (no
// get_problem_hint tool) and code execution stays the client HTTP path, but
// the legacy aliases keep working for the harness.
export type CanonicalToolName =
  | "get_current_interview"
  | "get_current_problem"
  | "get_last_submission"
  | "submit_interview_data"
  | "end_interview";

export type DeprecatedToolAlias =
  | "get_interview_state"
  | "get_candidate_performance"
  | "get_interview_configuration"
  | "get_problem_hint"
  | "record_candidate_answer"
  | "submit_solution"
  | "run_code";

export type ToolName = CanonicalToolName | DeprecatedToolAlias;

export const CANONICAL_TOOL_NAMES: readonly CanonicalToolName[] = [
  "get_current_interview",
  "get_current_problem",
  "get_last_submission",
  "submit_interview_data",
  "end_interview",
];

export const DEPRECATED_TOOL_ALIASES: readonly DeprecatedToolAlias[] = [
  "get_interview_state",
  "get_candidate_performance",
  "get_interview_configuration",
  "get_problem_hint",
  "record_candidate_answer",
  "submit_solution",
  "run_code",
];

export const TOOL_NAMES: readonly ToolName[] = [
  ...CANONICAL_TOOL_NAMES,
  ...DEPRECATED_TOOL_ALIASES,
];

export function isCanonicalToolName(raw: string): raw is CanonicalToolName {
  return (CANONICAL_TOOL_NAMES as readonly string[]).includes(raw);
}

export function isDeprecatedToolAlias(raw: string): raw is DeprecatedToolAlias {
  return (DEPRECATED_TOOL_ALIASES as readonly string[]).includes(raw);
}

export function isToolName(raw: string): raw is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(raw);
}

export interface ToolContext {
  readonly interviewId: InterviewId;
  readonly callId: string;
}

/** Raw model-supplied arguments (from tool-exec `arguments`). */
export type ToolArgs = Record<string, unknown>;

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
  /** S7a sandbox progress (HLD 6.4): persisted submissions + latest run. */
  readonly submissionCount: number;
  readonly lastRunStatus: RunStatus | null;
}

export interface EndInterviewResult {
  readonly status: InterviewStatus;
  readonly transitioned: boolean;
}

export interface InterviewConfigurationResult {
  readonly configuration: InterviewConfiguration;
  readonly status: InterviewStatus;
  readonly problemCount: number;
  readonly currentProblemId: string | null;
}

export interface ProblemHintResult {
  readonly level: HintLevel;
  readonly hint: string;
  readonly revealsSolution: false;
  readonly hintsUsed: number;
}

export interface RecordAnswerResult {
  readonly recorded: boolean;
  readonly kind: ResponseKind;
  readonly responseCount: number;
}

export interface SubmitSolutionResult {
  readonly submissionId: string;
  readonly language: string;
  readonly codeLength: number;
  readonly submissionCount: number;
}

export interface RunCodeResult {
  readonly runId: string;
  readonly submissionId: string;
  readonly status: RunStatus;
  readonly passedCount: number;
  readonly totalCount: number;
}

// Phase 8 canonical read: interview + configuration + candidate context in one
// round-trip (folds get_interview_state / get_interview_configuration /
// get_candidate_performance).
export interface CurrentInterviewResult {
  readonly interview: {
    readonly id: string;
    readonly candidateId: string;
    readonly status: InterviewStatus;
    readonly configuration: InterviewConfiguration;
    readonly problemCount: number;
    readonly startedAt: string | null;
    readonly updatedAt: string;
  };
  readonly currentProblemId: string | null;
  readonly responseCount: number;
  readonly performance: {
    readonly byKind: Record<ResponseKind, number>;
    readonly hintsUsed: number;
    readonly hasEvaluation: boolean;
    readonly recommendation: EvaluationRecommendation | null;
    readonly submissionCount: number;
    readonly lastRunStatus: RunStatus | null;
  };
}

// Phase 8 canonical write: a candidate response (answer/approach/code/question/
// note) OR a code submission. Exactly one shape is recorded per call.
export type SubmitInterviewDataResult =
  | {
      readonly recorded: "response";
      readonly kind: ResponseKind;
      readonly responseCount: number;
    }
  | {
      readonly recorded: "code";
      readonly submissionId: string;
      readonly language: string;
      readonly codeLength: number;
      readonly submissionCount: number;
    };

// Fix B: fetch-last-submission read. The latest persisted submission
// (Submit stores code with zero runs), so the model can pull saved code on
// demand when the live editor has moved on. found:false is a definitive
// answer, not an error.
export type LastSubmissionResult =
  | { readonly found: false }
  | {
      readonly found: true;
      readonly submissionId: string;
      readonly language: string;
      readonly code: string;
      readonly truncated: boolean;
    };

export type ToolResult =
  | CurrentProblemResult
  | InterviewStateResult
  | CandidatePerformanceResult
  | EndInterviewResult
  | InterviewConfigurationResult
  | ProblemHintResult
  | RecordAnswerResult
  | SubmitSolutionResult
  | RunCodeResult
  | CurrentInterviewResult
  | LastSubmissionResult
  | SubmitInterviewDataResult;

export interface ToolServiceDeps {
  readonly interviews: InterviewService;
  readonly responses: ResponseRepository;
  readonly evaluations: EvaluationRepository;
  readonly events: EventRepository;
  readonly submissions: SubmissionService;
  readonly clock?: Clock;
}

// F6-4: a run started from the model tool path must finish before the browser
// forwarder's 8s request timeout, so its timeout is capped below that window.
// The HTTP runs route keeps the full 100ms..30s range.
const TOOL_RUN_MAX_TIMEOUT_MS = 6000;

// get_last_submission returns persisted code to the model: bound it like
// the live editor snapshot (client CANDIDATE_CODE_MAX_CHARS) so a 50k
// submission does not flood the realtime context.
const LAST_SUBMISSION_CODE_MAX_CHARS = 8000;

const RESPONSE_KINDS: readonly ResponseKind[] = [
  "answer",
  "approach",
  "code",
  "question",
  "note",
];

export class ToolService {
  private readonly interviews: InterviewService;
  private readonly responses: ResponseRepository;
  private readonly evaluations: EvaluationRepository;
  private readonly events: EventRepository;
  private readonly submissions: SubmissionService;
  private readonly clock: Clock;

  constructor(deps: ToolServiceDeps) {
    this.interviews = deps.interviews;
    this.responses = deps.responses;
    this.evaluations = deps.evaluations;
    this.events = deps.events;
    this.submissions = deps.submissions;
    this.clock = deps.clock ?? systemClock;
  }

  async dispatch(
    name: ToolName,
    ctx: ToolContext,
    args?: ToolArgs,
  ): Promise<Result<ToolResult>> {
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
      case "get_last_submission":
        result = await this.getLastSubmission(ctx);
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
      case "get_interview_configuration":
        result = await this.getInterviewConfiguration(ctx);
        break;
      case "get_problem_hint":
        result = await this.getProblemHint(ctx, args);
        break;
      case "record_candidate_answer":
        result = await this.recordCandidateAnswer(ctx, args);
        break;
      case "submit_solution":
        result = await this.submitSolution(ctx, args);
        break;
      case "run_code":
        result = await this.runCode(ctx, args);
        break;
      // Phase 8 canonical tools.
      case "get_current_interview":
        result = await this.getCurrentInterview(ctx);
        break;
      case "submit_interview_data":
        result = await this.submitInterviewData(ctx, args);
        break;
      default: {
        // Exhaustive guard (audit F8): a future ToolName added without a
        // handler fails as a domain error instead of a TypeError.
        const unknown: never = name;
        result = err(
          domainError("VALIDATION_ERROR", `Unknown tool: ${String(unknown)}`),
        );
        break;
      }
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

  async getLastSubmission(
    ctx: ToolContext,
  ): Promise<Result<LastSubmissionResult>> {
    const latest = await this.submissions.latestSubmission(ctx.interviewId);
    if (!latest.ok) return latest;
    if (latest.value === null) return ok({ found: false });
    const sub = latest.value;
    if (sub.code.length <= LAST_SUBMISSION_CODE_MAX_CHARS) {
      return ok({
        found: true,
        submissionId: sub.id,
        language: sub.language,
        code: sub.code,
        truncated: false,
      });
    }
    return ok({
      found: true,
      submissionId: sub.id,
      language: sub.language,
      code: sub.code.slice(-LAST_SUBMISSION_CODE_MAX_CHARS),
      truncated: true,
    });
  }

  async getCandidatePerformance(
    ctx: ToolContext,
  ): Promise<Result<CandidatePerformanceResult>> {
    const state = await this.interviews.getState(ctx.interviewId);
    if (!state.ok) return state;
    return this.performanceSummary(ctx, state.value.evaluation);
  }

  // Shared performance assembly for the legacy get_candidate_performance alias
  // and the canonical get_current_interview tool.
  private async performanceSummary(
    ctx: ToolContext,
    evaluation: Evaluation | null,
  ): Promise<Result<CandidatePerformanceResult>> {
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
    const submissionCount = await this.submissions.submissionCount(
      ctx.interviewId,
    );
    const latest = await this.submissions.latestSummary(ctx.interviewId);
    if (!latest.ok) return latest;
    return ok({
      responseCount: responses.length,
      byKind,
      hintsUsed: evaluation?.hintsUsed ?? 0,
      // I5-4: a hint-only row (dimensions empty) is hint accounting, not a
      // completed evaluation - report "evaluated" only once scored.
      hasEvaluation:
        evaluation !== null && Object.keys(evaluation.dimensions).length > 0,
      recommendation: evaluation?.recommendation ?? null,
      submissionCount,
      lastRunStatus: latest.value?.status ?? null,
    });
  }

  // Phase 8 canonical read: interview + configuration + candidate context in
  // one round-trip. Folds the legacy get_interview_state,
  // get_interview_configuration, and get_candidate_performance results.
  async getCurrentInterview(
    ctx: ToolContext,
  ): Promise<Result<CurrentInterviewResult>> {
    const state = await this.interviews.getState(ctx.interviewId);
    if (!state.ok) return state;
    const performance = await this.performanceSummary(
      ctx,
      state.value.evaluation,
    );
    if (!performance.ok) return performance;
    const interview = state.value.interview;
    const { responseCount, ...rest } = performance.value;
    return ok({
      interview: {
        id: interview.id,
        candidateId: interview.candidateId,
        status: interview.status,
        configuration: interview.configuration,
        problemCount: interview.problems.length,
        startedAt: interview.startedAt?.toISOString() ?? null,
        updatedAt: interview.updatedAt.toISOString(),
      },
      currentProblemId: state.value.currentProblem?.id ?? null,
      responseCount,
      performance: rest,
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

  // Structured context (HLD 5.2): the model reads backend-owned
  // configuration instead of inventing interview rules.
  async getInterviewConfiguration(
    ctx: ToolContext,
  ): Promise<Result<InterviewConfigurationResult>> {
    const state = await this.interviews.getState(ctx.interviewId);
    if (!state.ok) return state;
    return ok({
      configuration: state.value.interview.configuration,
      status: state.value.interview.status,
      problemCount: state.value.interview.problems.length,
      currentProblemId: state.value.currentProblem?.id ?? null,
    });
  }

  // Controlled hints (HLD 5.4): tiered guidance, never the solution.
  // Optional args.level 1..3; defaults to nextHintLevel(hintsUsed).
  // Every issued hint increments hintsUsed (visible to evaluation).
  async getProblemHint(
    ctx: ToolContext,
    args?: ToolArgs,
  ): Promise<Result<ProblemHintResult>> {
    const rawLevel = args?.["level"];
    let requested: HintLevel | null = null;
    if (rawLevel !== undefined) {
      requested = parseHintLevel(rawLevel);
      if (requested === null) {
        return err(
          domainError("VALIDATION_ERROR", "hint level must be 1, 2, or 3", {
            level: rawLevel,
          }),
        );
      }
    }
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
    const hintsUsedSoFar = state.value.evaluation?.hintsUsed ?? 0;
    const level = requested ?? nextHintLevel(hintsUsedSoFar);
    const built = buildHint(state.value.currentProblem, level);
    const recorded = await this.interviews.recordHint(ctx.interviewId, level);
    if (!recorded.ok) return recorded;
    return ok({
      level: built.level,
      hint: built.hint,
      revealsSolution: false,
      hintsUsed: recorded.value,
    });
  }

  // Model-observed answers become persisted candidate responses (backend
  // owns them from here on). Args: { kind?, content (required), problemId? }.
  async recordCandidateAnswer(
    ctx: ToolContext,
    args?: ToolArgs,
  ): Promise<Result<RecordAnswerResult>> {
    const rawKind = args?.["kind"] ?? "answer";
    if (
      typeof rawKind !== "string" ||
      !(RESPONSE_KINDS as readonly string[]).includes(rawKind)
    ) {
      return err(
        domainError(
          "VALIDATION_ERROR",
          "kind must be one of answer, approach, code, question, note",
          { kind: rawKind },
        ),
      );
    }
    const kind = rawKind as ResponseKind;
    const rawContent = args?.["content"];
    if (typeof rawContent !== "string" || rawContent.trim().length === 0) {
      return err(
        domainError("VALIDATION_ERROR", "content must be a non-empty string"),
      );
    }
    if (rawContent.length > MAX_RESPONSE_CONTENT_LENGTH) {
      return err(
        domainError(
          "VALIDATION_ERROR",
          `content must be at most ${MAX_RESPONSE_CONTENT_LENGTH} characters`,
        ),
      );
    }
    const rawProblemId = args?.["problemId"];
    let problemId: ProblemId | undefined;
    if (rawProblemId !== undefined) {
      if (typeof rawProblemId !== "string" || rawProblemId.trim() === "") {
        return err(
          domainError("VALIDATION_ERROR", "problemId must be a non-empty string"),
        );
      }
      problemId = asProblemId(rawProblemId);
    }
    const recorded = await this.interviews.recordResponse(ctx.interviewId, {
      kind,
      content: rawContent,
      ...(problemId === undefined ? {} : { problemId }),
    });
    if (!recorded.ok) return recorded;
    const responses = await this.responses.listByInterview(ctx.interviewId);
    return ok({ recorded: true, kind, responseCount: responses.length });
  }

  // Candidate code becomes backend-owned state (HLD 6.1). Args:
  // { language (required: javascript|python), code (required),
  //   problemId? }. Returns the persisted submission id for run_code.
  async submitSolution(
    ctx: ToolContext,
    args?: ToolArgs,
  ): Promise<Result<SubmitSolutionResult>> {
    const rawLanguage = args?.["language"];
    if (typeof rawLanguage !== "string" || rawLanguage.trim() === "") {
      return err(
        domainError(
          "VALIDATION_ERROR",
          "language must be one of javascript, python, cpp",
        ),
      );
    }
    const rawCode = args?.["code"];
    if (typeof rawCode !== "string" || rawCode.trim().length === 0) {
      return err(
        domainError("VALIDATION_ERROR", "code must be a non-empty string"),
      );
    }
    const rawProblemId = args?.["problemId"];
    let problemId: string | undefined;
    if (rawProblemId !== undefined) {
      if (typeof rawProblemId !== "string" || rawProblemId.trim() === "") {
        return err(
          domainError("VALIDATION_ERROR", "problemId must be a non-empty string"),
        );
      }
      problemId = rawProblemId;
    }
    const submitted = await this.submissions.submit(ctx.interviewId, {
      language: rawLanguage,
      code: rawCode,
      ...(problemId === undefined ? {} : { problemId }),
    });
    if (!submitted.ok) return submitted;
    const count = await this.submissions.submissionCount(ctx.interviewId);
    return ok({
      submissionId: submitted.value.id,
      language: submitted.value.language,
      codeLength: submitted.value.code.length,
      submissionCount: count,
    });
  }

  // Execute code against caller-supplied cases (HLD 6.2/6.3). Args:
  // { submissionId? (defaults to latest), testCases (required),
  //   timeoutMs? }. Timeout/error outcomes are results, not dispatch
  // failures, so the model can react to them conversationally.
  async runCode(
    ctx: ToolContext,
    args?: ToolArgs,
  ): Promise<Result<RunCodeResult>> {
    const rawSubmissionId = args?.["submissionId"];
    let submissionId = "";
    if (rawSubmissionId !== undefined) {
      if (typeof rawSubmissionId !== "string" || rawSubmissionId.trim() === "") {
        return err(
          domainError(
            "VALIDATION_ERROR",
            "submissionId must be a non-empty string",
          ),
        );
      }
      submissionId = rawSubmissionId;
    } else {
      const latest = await this.submissions.latestSubmission(ctx.interviewId);
      if (!latest.ok) return latest;
      if (latest.value === null) {
        return err(
          domainError(
            "NOT_FOUND",
            `Interview ${ctx.interviewId} has no submissions yet`,
            { interviewId: ctx.interviewId },
          ),
        );
      }
      submissionId = latest.value.id;
    }
    const rawTimeout = args?.["timeoutMs"];
    const timeoutMs =
      typeof rawTimeout === "number" && rawTimeout > TOOL_RUN_MAX_TIMEOUT_MS
        ? TOOL_RUN_MAX_TIMEOUT_MS
        : rawTimeout;
    const run = await this.submissions.runTests(
      asSubmissionId(submissionId),
      args?.["testCases"],
      timeoutMs,
    );
    if (!run.ok) return run;
    return ok({
      runId: run.value.id,
      submissionId: run.value.submissionId,
      status: run.value.status,
      passedCount: run.value.passedCount,
      totalCount: run.value.totalCount,
    });
  }

  // Phase 8 canonical write (folds record_candidate_answer + submit_solution).
  // Args are a discriminated shape by presence:
  //   - { language, code, problemId? }  -> persist a code submission
  //   - { kind?, content, problemId? }  -> persist a candidate response
  // A call with any code field takes the submission path; otherwise content is
  // required. Missing/partial shapes surface the underlying VALIDATION_ERROR.
  async submitInterviewData(
    ctx: ToolContext,
    args?: ToolArgs,
  ): Promise<Result<SubmitInterviewDataResult>> {
    const hasCodeFields =
      args?.["language"] !== undefined || args?.["code"] !== undefined;
    if (hasCodeFields) {
      const submitted = await this.submitSolution(ctx, args);
      if (!submitted.ok) return submitted;
      return ok({
        recorded: "code",
        submissionId: submitted.value.submissionId,
        language: submitted.value.language,
        codeLength: submitted.value.codeLength,
        submissionCount: submitted.value.submissionCount,
      });
    }
    const recorded = await this.recordCandidateAnswer(ctx, args);
    if (!recorded.ok) return recorded;
    return ok({
      recorded: "response",
      kind: recorded.value.kind,
      responseCount: recorded.value.responseCount,
    });
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
