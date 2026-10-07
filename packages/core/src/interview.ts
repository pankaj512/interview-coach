import type { InterviewId, ProblemId, RecommendationId, TopicId, UserId } from "./ids.js";
import { newInterviewId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Interview session: one candidate's attempt (HLD 5.3). Backend owns every
// field here; the model only reads them through narrow tools.
export type InterviewType = "dsa";

export type InterviewStatus =
  | "created"
  | "ready"
  | "in_progress"
  | "paused"
  | "completing"
  | "completed"
  | "cancelled"
  | "failed";

export const TERMINAL_STATUSES: readonly InterviewStatus[] = [
  "completed",
  "cancelled",
  "failed",
];

export function isTerminalStatus(status: InterviewStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export type InterviewDifficulty = "Easy" | "Medium" | "Hard" | "Mixed";

export interface InterviewConfiguration {
  readonly interviewType: InterviewType;
  readonly difficulty?: InterviewDifficulty;
  readonly durationMinutes?: number;
  readonly problemCount?: number;
  readonly topicFocus?: readonly string[];
}

// Runtime validation is the domain boundary, independent of the backend's
// zod schema: untyped callers (tests, scripts, future transports) must not be
// able to persist an invalid configuration (audit F4).
const INTERVIEW_DIFFICULTIES: readonly InterviewDifficulty[] = [
  "Easy",
  "Medium",
  "Hard",
  "Mixed",
];

export function validateConfiguration(
  config: InterviewConfiguration,
): Result<InterviewConfiguration> {
  if ((config.interviewType as string) !== "dsa") {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `Unsupported interviewType: ${String(config.interviewType)}`,
        { allowed: ["dsa"] },
      ),
    );
  }
  if (
    config.difficulty !== undefined &&
    !INTERVIEW_DIFFICULTIES.includes(config.difficulty)
  ) {
    return err(
      domainError("VALIDATION_ERROR", `Unknown difficulty: ${String(config.difficulty)}`, {
        allowed: INTERVIEW_DIFFICULTIES,
      }),
    );
  }
  if (
    config.durationMinutes !== undefined &&
    (!Number.isInteger(config.durationMinutes) ||
      config.durationMinutes <= 0 ||
      config.durationMinutes > 480)
  ) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        "durationMinutes must be an integer 1..480",
      ),
    );
  }
  if (
    config.problemCount !== undefined &&
    (!Number.isInteger(config.problemCount) || config.problemCount <= 0)
  ) {
    return err(
      domainError("VALIDATION_ERROR", "problemCount must be a positive integer"),
    );
  }
  if (config.topicFocus !== undefined) {
    if (config.topicFocus.length > 20) {
      return err(
        domainError("VALIDATION_ERROR", "topicFocus must have at most 20 entries"),
      );
    }
    for (const topic of config.topicFocus) {
      if (typeof topic !== "string" || topic.trim() === "" || topic.length > 120) {
        return err(
          domainError(
            "VALIDATION_ERROR",
            "topicFocus entries must be non-empty strings of at most 120 characters",
          ),
        );
      }
    }
  }
  return ok(config);
}

export type InterviewProblemState =
  | "assigned"
  | "active"
  | "completed"
  | "skipped";

export interface InterviewProblem {
  readonly interviewId: InterviewId;
  readonly problemId: ProblemId;
  readonly order: number;
  readonly state: InterviewProblemState;
}

export interface Interview {
  readonly id: InterviewId;
  readonly candidateId: UserId;
  readonly type: InterviewType;
  readonly status: InterviewStatus;
  readonly configuration: InterviewConfiguration;
  readonly problems: readonly InterviewProblem[];
  readonly currentOrder: number | null;
  /** Learning-loop Phase 9: the recommendation this session was started from. */
  readonly recommendationId?: RecommendationId;
  /** Learning-loop Phase 9: the curriculum topic the session targets. */
  readonly topicId?: TopicId;
  /** Learning-loop Phase 10: async evaluation lifecycle (Phase 9 persists "none"). */
  readonly evaluationStatus: EvaluationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
}

// Phase 10 drives pending -> completed/failed; Phase 9 only ever persists
// "none" (no evaluation has been requested yet).
export type EvaluationStatus = "none" | "pending" | "completed" | "failed";

export interface CreateInterviewInput {
  readonly candidateId: UserId;
  readonly configuration: InterviewConfiguration;
  readonly recommendationId?: RecommendationId;
  readonly topicId?: TopicId;
  readonly now?: Date;
}

export function createInterview(input: CreateInterviewInput): Result<Interview> {
  const validated = validateConfiguration(input.configuration);
  if (!validated.ok) return validated;
  const now = input.now ?? new Date();
  return ok({
    id: newInterviewId(),
    candidateId: input.candidateId,
    type: input.configuration.interviewType,
    status: "created",
    configuration: validated.value,
    problems: [],
    currentOrder: null,
    ...(input.recommendationId === undefined
      ? {}
      : { recommendationId: input.recommendationId }),
    ...(input.topicId === undefined ? {} : { topicId: input.topicId }),
    evaluationStatus: "none",
    createdAt: now,
    updatedAt: now,
  });
}

// Reference to the actively discussed problem, if one is assigned.
export function currentProblemRef(
  interview: Interview,
): InterviewProblem | null {
  if (interview.currentOrder === null) return null;
  const ref = interview.problems.find(
    (p) => p.order === interview.currentOrder,
  );
  return ref ?? null;
}
