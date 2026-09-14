// @interview-coach/domain — per-user skill + curriculum state (Phase 3).
//
// UserSkillState is the persisted, per-topic mastery record the learning loop
// reads and updates; UserCurriculumProgress is the pointer into the curriculum
// (current topic + mastered topics). Both are backend-owned server state:
// the browser never writes them directly and the LLM never becomes the system
// of record (ADR-002).
//
// This module owns the mastery *scale* and its configurable thresholds. The
// mastery *algorithm* (turning an accepted evaluation into a new level) is
// Phase 10/11 and deliberately absent here — Phase 3 only persists and reads.

import type { CurriculumId, TopicId, UserId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Locked scale (roadmap locked decision 4 / micro-item 2).
export const MASTERY_LEVELS = [
  "not_started",
  "learning",
  "developing",
  "proficient",
  "mastered",
] as const;

export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

export const MASTERY_LEVEL_LABELS: Record<MasteryLevel, string> = {
  not_started: "Not started",
  learning: "Learning",
  developing: "Developing",
  proficient: "Proficient",
  mastered: "Mastered",
};

// Configurable default thresholds (documented, not tuned here): the number of
// successful attempts required to reach each level. A single success never
// masters a topic. Phase 10/11 applies these; Phase 3 persists the scale.
export const MASTERY_THRESHOLDS: Record<Exclude<MasteryLevel, "not_started">, number> = {
  learning: 1,
  developing: 2,
  proficient: 3,
  mastered: 3,
};

export function isMasteryLevel(value: string): value is MasteryLevel {
  return (MASTERY_LEVELS as readonly string[]).includes(value);
}

export type SkillOutcome = "success" | "partial" | "failure";

export const SKILL_OUTCOMES: readonly SkillOutcome[] = [
  "success",
  "partial",
  "failure",
];

export function isSkillOutcome(value: string): value is SkillOutcome {
  return (SKILL_OUTCOMES as readonly string[]).includes(value);
}

export const MAX_SKILL_NOTES = 20;
export const MAX_SKILL_NOTE_LENGTH = 200;

export interface UserSkillState {
  readonly userId: UserId;
  readonly curriculumId: CurriculumId;
  readonly topicId: TopicId;
  readonly masteryLevel: MasteryLevel;
  readonly successfulAttempts: number;
  readonly totalAttempts: number;
  readonly lastAttemptAt?: Date;
  readonly lastOutcome?: SkillOutcome;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserSkillStateInput {
  readonly userId: UserId;
  readonly curriculumId: CurriculumId;
  readonly topicId: TopicId;
  readonly masteryLevel?: MasteryLevel;
  readonly successfulAttempts?: number;
  readonly totalAttempts?: number;
  readonly lastAttemptAt?: Date;
  readonly lastOutcome?: SkillOutcome;
  readonly strengths?: readonly unknown[];
  readonly weaknesses?: readonly unknown[];
  readonly now?: Date;
}

export interface UserCurriculumProgress {
  readonly userId: UserId;
  readonly curriculumId: CurriculumId;
  /** Where the recommendation engine should resume, if any. */
  readonly currentTopicId?: TopicId;
  /** Topics at "mastered"; deduped, curriculum order preserved. */
  readonly completedTopicIds: readonly TopicId[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserCurriculumProgressInput {
  readonly userId: UserId;
  readonly curriculumId: CurriculumId;
  readonly currentTopicId?: TopicId;
  readonly completedTopicIds?: readonly unknown[];
  readonly now?: Date;
}

function nonNegativeInt(value: unknown, field: string): Result<number> {
  if (!Number.isInteger(value) || (value as number) < 0) {
    return err(
      domainError("VALIDATION_ERROR", `${field} must be a non-negative integer`),
    );
  }
  return ok(value as number);
}

function normalizeNotes(
  raw: readonly unknown[] | undefined,
  field: string,
): Result<readonly string[]> {
  if (raw === undefined) return ok([]);
  if (!Array.isArray(raw)) {
    return err(domainError("VALIDATION_ERROR", `${field} must be an array`));
  }
  if (raw.length > MAX_SKILL_NOTES) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `${field} must have at most ${MAX_SKILL_NOTES} entries`,
      ),
    );
  }
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      return err(domainError("VALIDATION_ERROR", `${field} entries must be strings`));
    }
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    if (trimmed.length > MAX_SKILL_NOTE_LENGTH) {
      return err(
        domainError(
          "VALIDATION_ERROR",
          `${field} entries must be at most ${MAX_SKILL_NOTE_LENGTH} characters`,
        ),
      );
    }
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return ok(out);
}

export function createUserSkillState(
  input: CreateUserSkillStateInput,
): Result<UserSkillState> {
  const masteryLevel = input.masteryLevel ?? "not_started";
  if (!isMasteryLevel(masteryLevel)) {
    return err(
      domainError("VALIDATION_ERROR", `Unknown masteryLevel: ${String(masteryLevel)}`, {
        allowed: MASTERY_LEVELS,
      }),
    );
  }
  const successful = nonNegativeInt(input.successfulAttempts ?? 0, "successfulAttempts");
  if (!successful.ok) return successful;
  const total = nonNegativeInt(input.totalAttempts ?? 0, "totalAttempts");
  if (!total.ok) return total;
  if (successful.value > total.value) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        "successfulAttempts must not exceed totalAttempts",
      ),
    );
  }
  if (input.lastOutcome !== undefined && !isSkillOutcome(input.lastOutcome)) {
    return err(
      domainError("VALIDATION_ERROR", `Unknown lastOutcome: ${String(input.lastOutcome)}`, {
        allowed: SKILL_OUTCOMES,
      }),
    );
  }
  const strengths = normalizeNotes(input.strengths, "strengths");
  if (!strengths.ok) return strengths;
  const weaknesses = normalizeNotes(input.weaknesses, "weaknesses");
  if (!weaknesses.ok) return weaknesses;
  const now = input.now ?? new Date();
  return ok({
    userId: input.userId,
    curriculumId: input.curriculumId,
    topicId: input.topicId,
    masteryLevel,
    successfulAttempts: successful.value,
    totalAttempts: total.value,
    ...(input.lastAttemptAt === undefined ? {} : { lastAttemptAt: input.lastAttemptAt }),
    ...(input.lastOutcome === undefined ? {} : { lastOutcome: input.lastOutcome }),
    strengths: strengths.value,
    weaknesses: weaknesses.value,
    createdAt: now,
    updatedAt: now,
  });
}

export function createUserCurriculumProgress(
  input: CreateUserCurriculumProgressInput,
): Result<UserCurriculumProgress> {
  const raw = input.completedTopicIds ?? [];
  if (!Array.isArray(raw)) {
    return err(
      domainError("VALIDATION_ERROR", "completedTopicIds must be an array"),
    );
  }
  const completed: TopicId[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return err(
        domainError("VALIDATION_ERROR", "completedTopicIds entries must be non-empty strings"),
      );
    }
    const topicId = entry as TopicId;
    if (!completed.includes(topicId)) completed.push(topicId);
  }
  const now = input.now ?? new Date();
  return ok({
    userId: input.userId,
    curriculumId: input.curriculumId,
    ...(input.currentTopicId === undefined ? {} : { currentTopicId: input.currentTopicId }),
    completedTopicIds: completed,
    createdAt: now,
    updatedAt: now,
  });
}
