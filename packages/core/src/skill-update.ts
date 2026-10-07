// @interview-coach/core - deterministic skill/curriculum update (Phase 11).
//
// Once an evaluation is persisted ("accepted"), the learning loop updates the
// user's mastery state and curriculum pointer as a *pure function of persisted
// state* - no further LLM call (roadmap "The learning loop"). The LLM proposes
// the evaluation; the backend decides what it means for mastery (ADR-002).
//
// This module owns the configurable decision rules:
//   * how an evaluation maps to an attempt outcome (success/partial/failure),
//   * how many successful attempts raise the mastery level (thresholds),
//   * when to `continue`, `revisit`, or `advance` to the next curriculum topic.
//
// The planning function is deterministic and side-effect free: identical
// inputs always yield an identical plan, and re-applying an evaluation that is
// already recorded on the skill state (`lastEvaluationId`) is a no-op.

import type { Evaluation } from "./evaluation.js";
import type { Curriculum } from "./curriculum.js";
import type { TopicId, UserId } from "./ids.js";
import type { Result } from "./result.js";
import { ok } from "./result.js";
import {
  MASTERY_LEVELS,
  MASTERY_THRESHOLDS,
  MAX_SKILL_NOTE_LENGTH,
  MAX_SKILL_NOTES,
  createUserCurriculumProgress,
  createUserSkillState,
  type MasteryLevel,
  type SkillOutcome,
  type UserCurriculumProgress,
  type UserSkillState,
} from "./skill.js";

export type SkillDecision = "continue" | "revisit" | "advance";

export const SKILL_DECISIONS: readonly SkillDecision[] = [
  "continue",
  "revisit",
  "advance",
];

// Configurable decision policy. Defaults are documented, not tuned here.
export interface SkillUpdatePolicy {
  /** At/above this overall score (0..100) the attempt is a success. */
  readonly successMinScore: number;
  /** At/above this overall score the attempt is at least a partial success. */
  readonly partialMinScore: number;
  /** At/above this score a success is "strong" (can master a topic). */
  readonly strongSuccessMinScore: number;
  /** Mastery level required before a success advances to the next topic. */
  readonly advanceMinMastery: MasteryLevel;
  /** Successful attempts required for each mastery level. */
  readonly thresholds: Record<Exclude<MasteryLevel, "not_started">, number>;
}

export const DEFAULT_SKILL_UPDATE_POLICY: SkillUpdatePolicy = {
  successMinScore: 70,
  partialMinScore: 50,
  strongSuccessMinScore: 85,
  advanceMinMastery: "proficient",
  thresholds: MASTERY_THRESHOLDS,
};

function levelRank(level: MasteryLevel): number {
  return MASTERY_LEVELS.indexOf(level);
}

export function higherMastery(a: MasteryLevel, b: MasteryLevel): MasteryLevel {
  return levelRank(a) >= levelRank(b) ? a : b;
}

// Maps a persisted evaluation to an attempt outcome. Score wins when present;
// otherwise the derived recommendation is used. With neither signal the
// attempt is "partial" (neutral): a missing signal must never inflate mastery.
export function evaluateSkillOutcome(
  evaluation: Evaluation,
  policy: SkillUpdatePolicy = DEFAULT_SKILL_UPDATE_POLICY,
): SkillOutcome {
  const score = evaluation.overallScore;
  if (typeof score === "number") {
    if (score >= policy.successMinScore) return "success";
    if (score >= policy.partialMinScore) return "partial";
    return "failure";
  }
  const recommendation = evaluation.recommendation;
  if (recommendation === "hire" || recommendation === "lean_hire") return "success";
  if (recommendation === "lean_no_hire") return "partial";
  if (recommendation === "no_hire") return "failure";
  return "partial";
}

export function isStrongSuccess(
  evaluation: Evaluation,
  policy: SkillUpdatePolicy = DEFAULT_SKILL_UPDATE_POLICY,
): boolean {
  const score = evaluation.overallScore;
  if (typeof score === "number") return score >= policy.strongSuccessMinScore;
  return evaluation.recommendation === "hire";
}

// Highest level whose successful-attempt threshold is met. `mastered` shares
// the `proficient` threshold but additionally requires a strong success, so a
// bare pass never masters a topic (roadmap locked decision 4).
export function masteryLevelFor(
  successfulAttempts: number,
  strongSuccess: boolean,
  thresholds: SkillUpdatePolicy["thresholds"] = MASTERY_THRESHOLDS,
): MasteryLevel {
  if (successfulAttempts <= 0) return "not_started";
  if (successfulAttempts >= thresholds.mastered && strongSuccess) return "mastered";
  if (successfulAttempts >= thresholds.proficient) return "proficient";
  if (successfulAttempts >= thresholds.developing) return "developing";
  if (successfulAttempts >= thresholds.learning) return "learning";
  return "not_started";
}

// Failure revisits the same topic; a success that reached the advance
// threshold moves on; everything else stays on the current topic.
export function decideSkillAction(
  outcome: SkillOutcome,
  masteryLevel: MasteryLevel,
  policy: SkillUpdatePolicy = DEFAULT_SKILL_UPDATE_POLICY,
): SkillDecision {
  if (outcome === "failure") return "revisit";
  if (outcome === "partial") return "continue";
  return levelRank(masteryLevel) >= levelRank(policy.advanceMinMastery)
    ? "advance"
    : "continue";
}

function orderedTopics(curriculum: Curriculum): readonly TopicId[] {
  return [...curriculum.topics]
    .sort((a, b) => a.order - b.order)
    .map((topic) => topic.id);
}

export function nextTopicId(
  curriculum: Curriculum,
  topicId: TopicId,
): TopicId | null {
  const ordered = orderedTopics(curriculum);
  const index = ordered.indexOf(topicId);
  if (index === -1 || index + 1 >= ordered.length) return null;
  return ordered[index + 1] ?? null;
}

function sortTopicIdsByCurriculum(
  topicIds: readonly TopicId[],
  curriculum: Curriculum,
): TopicId[] {
  const order = new Map<TopicId, number>();
  for (const topic of curriculum.topics) order.set(topic.id, topic.order);
  const deduped: TopicId[] = [];
  for (const id of topicIds) if (!deduped.includes(id)) deduped.push(id);
  return deduped.sort(
    (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

function mergeNotes(
  previous: readonly string[] | undefined,
  next: readonly string[],
): string[] {
  const out: string[] = [];
  for (const raw of [...(previous ?? []), ...next]) {
    const trimmed = raw.trim().slice(0, MAX_SKILL_NOTE_LENGTH);
    if (trimmed === "" || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out.length > MAX_SKILL_NOTES ? out.slice(-MAX_SKILL_NOTES) : out;
}

export interface PlanSkillUpdateInput {
  readonly userId: UserId;
  readonly topicId: TopicId;
  readonly curriculum: Curriculum;
  readonly evaluation: Evaluation;
  readonly skillState: UserSkillState | null;
  readonly progress: UserCurriculumProgress | null;
  readonly now?: Date;
  readonly policy?: SkillUpdatePolicy;
}

export interface SkillUpdatePlan {
  readonly userId: UserId;
  readonly curriculumId: Curriculum["id"];
  readonly topicId: TopicId;
  readonly outcome: SkillOutcome;
  readonly decision: SkillDecision;
  readonly previousMasteryLevel: MasteryLevel;
  readonly masteryLevel: MasteryLevel;
  readonly successfulAttempts: number;
  readonly totalAttempts: number;
  /** The curriculum pointer after the update (unchanged unless advancing). */
  readonly currentTopicId: TopicId;
  readonly advanced: boolean;
  readonly completedTopicIds: readonly TopicId[];
  readonly skillState: UserSkillState;
  readonly progress: UserCurriculumProgress;
}

// Plans the deterministic update. Returns `ok(null)` when the evaluation was
// already applied (idempotent no-op); an error only when the resulting state
// is invalid.
export function planSkillUpdate(
  input: PlanSkillUpdateInput,
): Result<SkillUpdatePlan | null> {
  const policy = input.policy ?? DEFAULT_SKILL_UPDATE_POLICY;
  const now = input.now ?? new Date();
  const previous = input.skillState;

  // Idempotency: the same evaluation never advances the counters twice.
  if (previous?.lastEvaluationId === input.evaluation.id) return ok(null);

  const outcome = evaluateSkillOutcome(input.evaluation, policy);
  const successfulAttempts =
    (previous?.successfulAttempts ?? 0) + (outcome === "success" ? 1 : 0);
  const totalAttempts = (previous?.totalAttempts ?? 0) + 1;
  const computed = masteryLevelFor(
    successfulAttempts,
    isStrongSuccess(input.evaluation, policy),
    policy.thresholds,
  );
  // Mastery is a high-water mark: a later weak attempt never demotes a level
  // already demonstrated.
  const masteryLevel = higherMastery(previous?.masteryLevel ?? "not_started", computed);
  const decision = decideSkillAction(outcome, masteryLevel, policy);

  const followingTopicId = nextTopicId(input.curriculum, input.topicId);
  const advanced = decision === "advance" && followingTopicId !== null;
  const currentTopicId: TopicId =
    followingTopicId !== null && decision === "advance" ? followingTopicId : input.topicId;

  const completedTopicIds =
    masteryLevel === "mastered"
      ? sortTopicIdsByCurriculum(
          [...(input.progress?.completedTopicIds ?? []), input.topicId],
          input.curriculum,
        )
      : sortTopicIdsByCurriculum(input.progress?.completedTopicIds ?? [], input.curriculum);

  const skillState = createUserSkillState({
    userId: input.userId,
    curriculumId: input.curriculum.id,
    topicId: input.topicId,
    masteryLevel,
    successfulAttempts,
    totalAttempts,
    lastAttemptAt: now,
    lastOutcome: outcome,
    lastEvaluationId: input.evaluation.id,
    strengths: mergeNotes(previous?.strengths, input.evaluation.strengths),
    weaknesses: mergeNotes(previous?.weaknesses, input.evaluation.weaknesses),
    now,
  });
  if (!skillState.ok) return skillState;

  const progress = createUserCurriculumProgress({
    userId: input.userId,
    curriculumId: input.curriculum.id,
    currentTopicId,
    completedTopicIds,
    now,
  });
  if (!progress.ok) return progress;

  return ok({
    userId: input.userId,
    curriculumId: input.curriculum.id,
    topicId: input.topicId,
    outcome,
    decision,
    previousMasteryLevel: previous?.masteryLevel ?? "not_started",
    masteryLevel,
    successfulAttempts,
    totalAttempts,
    currentTopicId,
    advanced,
    completedTopicIds,
    skillState: {
      ...skillState.value,
      createdAt: previous?.createdAt ?? skillState.value.createdAt,
    },
    progress: {
      ...progress.value,
      createdAt: input.progress?.createdAt ?? progress.value.createdAt,
    },
  });
}
