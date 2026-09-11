import type {
  InterviewId,
  ProblemId,
  RunId,
  SubmissionId,
} from "./ids.js";
import { newRunId, newSubmissionId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// @interview-coach/domain — code execution sandbox model (HLD Phase 6, S7a).
//
// Pure layer: submission/test-case validation, executor port, deterministic
// run assembly (hidden-test masking, status derivation), execution summaries
// for evaluation integration (HLD 6.4). Actual process execution lives in the
// backend local runner; this file never spawns processes.

export type CodeLanguage = "javascript" | "python";

export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  "javascript",
  "python",
];

export function isCodeLanguage(raw: string): raw is CodeLanguage {
  return (CODE_LANGUAGES as readonly string[]).includes(raw);
}

/** Hard cap: submissions are source text, never binaries. */
export const MAX_SUBMISSION_CHARS = 50_000;
/** Hard cap: one run exercises at most 50 cases. */
export const MAX_TEST_CASES = 50;

export interface CodeSubmission {
  readonly id: SubmissionId;
  readonly interviewId: InterviewId;
  readonly problemId?: ProblemId;
  readonly language: CodeLanguage;
  readonly code: string;
  readonly createdAt: Date;
}

export interface SubmitCodeInput {
  readonly interviewId: InterviewId;
  readonly language: string;
  readonly code: string;
  readonly problemId?: ProblemId;
  readonly now?: Date;
}

export function createSubmission(
  input: SubmitCodeInput,
): Result<CodeSubmission> {
  if (!isCodeLanguage(input.language)) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        "language must be one of javascript, python",
        { language: input.language },
      ),
    );
  }
  const code = input.code.trim();
  if (code.length === 0) {
    return err(domainError("VALIDATION_ERROR", "code must not be empty"));
  }
  if (input.code.length > MAX_SUBMISSION_CHARS) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `code must be at most ${MAX_SUBMISSION_CHARS} characters`,
      ),
    );
  }
  return ok({
    id: newSubmissionId(),
    interviewId: input.interviewId,
    language: input.language,
    code,
    createdAt: input.now ?? new Date(),
    ...(input.problemId === undefined ? {} : { problemId: input.problemId }),
  });
}

// A single deterministic check: call solve(...args), compare with expected.
// `hidden` cases never leak actuals — results carry pass/fail only.
export interface RunTestCase {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly expected: unknown;
  readonly hidden: boolean;
}

export function parseTestCases(raw: unknown): Result<RunTestCase[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return err(
      domainError("VALIDATION_ERROR", "testCases must be a non-empty array"),
    );
  }
  if (raw.length > MAX_TEST_CASES) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `testCases must contain at most ${MAX_TEST_CASES} cases`,
      ),
    );
  }
  const seen = new Set<string>();
  const parsed: RunTestCase[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      return err(
        domainError("VALIDATION_ERROR", "each test case must be an object"),
      );
    }
    const record = entry as Record<string, unknown>;
    const name = record["name"];
    if (typeof name !== "string" || name.trim() === "" || name.length > 120) {
      return err(
        domainError(
          "VALIDATION_ERROR",
          "each test case needs a name (1..120 chars)",
        ),
      );
    }
    if (seen.has(name)) {
      return err(
        domainError("VALIDATION_ERROR", `duplicate test case name: ${name}`),
      );
    }
    seen.add(name);
    const args = record["args"];
    if (!Array.isArray(args)) {
      return err(
        domainError(
          "VALIDATION_ERROR",
          `test case "${name}" needs an args array`,
        ),
      );
    }
    if (!isJsonValue(args) || !isJsonValue(record["expected"])) {
      return err(
        domainError(
          "VALIDATION_ERROR",
          `test case "${name}" args/expected must be JSON-serializable`,
        ),
      );
    }
    const hidden = record["hidden"] ?? false;
    if (typeof hidden !== "boolean") {
      return err(
        domainError(
          "VALIDATION_ERROR",
          `test case "${name}" hidden must be a boolean`,
        ),
      );
    }
    parsed.push({
      name,
      args: args as readonly unknown[],
      expected: record["expected"],
      hidden,
    });
  }
  return ok(parsed);
}

function isJsonValue(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

export type RunStatus = "passed" | "failed" | "timeout" | "error";

export interface TestResult {
  readonly name: string;
  readonly hidden: boolean;
  readonly passed: boolean;
  /** Visible cases only; hidden cases never leak actuals. */
  readonly actual?: unknown;
  readonly error?: string;
}

export interface CodeRun {
  readonly id: RunId;
  readonly submissionId: SubmissionId;
  readonly interviewId: InterviewId;
  readonly status: RunStatus;
  readonly results: readonly TestResult[];
  readonly passedCount: number;
  readonly totalCount: number;
  readonly durationMs: number;
  readonly createdAt: Date;
}

// Executor port (implemented by the backend local runner). Outcomes are
// transport-level: completed (per-case verdicts), timeout (killed), error
// (runner/harness failure before verdicts).
export interface ExecutorTestOutcome {
  readonly name: string;
  readonly passed: boolean;
  readonly actual?: unknown;
  readonly error?: string;
}

export interface ExecutorOutcome {
  readonly status: "completed" | "timeout" | "error";
  readonly results: readonly ExecutorTestOutcome[];
  readonly durationMs: number;
  readonly error?: string;
}

export interface RunLimits {
  readonly timeoutMs: number;
}

export const DEFAULT_RUN_TIMEOUT_MS = 5_000;
export const MIN_RUN_TIMEOUT_MS = 100;
export const MAX_RUN_TIMEOUT_MS = 30_000;

export function parseRunLimits(raw: unknown): Result<RunLimits> {
  if (raw === undefined) return ok({ timeoutMs: DEFAULT_RUN_TIMEOUT_MS });
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return err(domainError("VALIDATION_ERROR", "timeoutMs must be an integer"));
  }
  if (raw < MIN_RUN_TIMEOUT_MS || raw > MAX_RUN_TIMEOUT_MS) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `timeoutMs must be ${MIN_RUN_TIMEOUT_MS}..${MAX_RUN_TIMEOUT_MS}`,
      ),
    );
  }
  return ok({ timeoutMs: raw });
}

export interface CodeExecutor {
  execute(
    submission: CodeSubmission,
    testCases: readonly RunTestCase[],
    limits: RunLimits,
  ): Promise<ExecutorOutcome>;
}

/**
 * Deterministic run assembly: hidden cases keep pass/fail but drop actuals
 * (and per-case errors stay, they describe the harness, not the solution).
 * Status: timeout/error pass through; otherwise passed iff every case passed.
 */
export function assembleRun(
  submission: CodeSubmission,
  testCases: readonly RunTestCase[],
  outcome: ExecutorOutcome,
  now?: Date,
): CodeRun {
  const byName = new Map(
    testCases.map((t) => [t.name, t] as const),
  );
  const results: TestResult[] = outcome.results.map((r) => {
    const hidden = byName.get(r.name)?.hidden ?? false;
    return {
      name: r.name,
      hidden,
      passed: outcome.status === "completed" && r.passed,
      ...(hidden || r.actual === undefined ? {} : { actual: r.actual }),
      ...(r.error === undefined ? {} : { error: truncate(r.error, 2000) }),
    };
  });
  const passedCount = results.filter((r) => r.passed).length;
  const status: RunStatus =
    outcome.status === "timeout"
      ? "timeout"
      : outcome.status === "error"
        ? "error"
        : passedCount === results.length
          ? "passed"
          : "failed";
  return {
    id: newRunId(),
    submissionId: submission.id,
    interviewId: submission.interviewId,
    status,
    results,
    passedCount,
    totalCount: results.length,
    durationMs: Math.max(0, Math.round(outcome.durationMs)),
    createdAt: now ?? new Date(),
  };
}

/** Run-level error text (timeout/harness failure) attached for debugging. */
export function assembleErrorRun(
  submission: CodeSubmission,
  testCases: readonly RunTestCase[],
  message: string,
  durationMs: number,
  now?: Date,
): CodeRun {
  return assembleRun(
    submission,
    testCases,
    {
      status: "error",
      results: testCases.map((t) => ({
        name: t.name,
        passed: false,
        error: message,
      })),
      durationMs,
      error: message,
    },
    now,
  );
}

// Evaluation integration (HLD 6.4, backend half): the deterministic summary
// the eval pipeline and performance tool surface. Scoring policy over these
// numbers belongs to S7b; this half persists and exposes them.
export interface ExecutionSummary {
  readonly runId: string;
  readonly submissionId: string;
  readonly status: RunStatus;
  readonly passedCount: number;
  readonly totalCount: number;
  readonly passRate: number;
}

export function summarizeRun(run: CodeRun): ExecutionSummary {
  return {
    runId: run.id,
    submissionId: run.submissionId,
    status: run.status,
    passedCount: run.passedCount,
    totalCount: run.totalCount,
    passRate:
      run.totalCount === 0
        ? 0
        : Math.round((run.passedCount / run.totalCount) * 100),
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
