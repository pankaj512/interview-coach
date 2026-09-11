import type { InterviewId, ProblemId, UserId } from "./ids.js";
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

export type InterviewDifficulty = "Easy" | "Medium" | "Mixed";

export interface InterviewConfiguration {
  readonly interviewType: InterviewType;
  readonly difficulty?: InterviewDifficulty;
  readonly durationMinutes?: number;
  readonly problemCount?: number;
  readonly topicFocus?: readonly string[];
}

export function validateConfiguration(
  config: InterviewConfiguration,
): Result<InterviewConfiguration> {
  if (
    config.durationMinutes !== undefined &&
    (!Number.isInteger(config.durationMinutes) || config.durationMinutes <= 0)
  ) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        "durationMinutes must be a positive integer",
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
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
}

export interface CreateInterviewInput {
  readonly candidateId: UserId;
  readonly configuration: InterviewConfiguration;
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
