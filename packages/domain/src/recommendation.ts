// @interview-coach/domain - recommendation (learning-loop Phase 4).
//
// The product loop starts with a recommendation: given the user's profile,
// curriculum, per-topic skill state, and progress pointer, decide what to
// practice next. The LLM may *propose* topic + problem, but it may only choose
// from a backend-built candidate set and the backend validates, canonicalizes,
// and persists the result (ADR-002: the LLM is not the system of record).
//
// Everything here is pure: the candidate builder is deterministic (same input
// -> same ordered candidates), so it doubles as the guaranteed fallback when
// the model is unavailable, slow, or returns something invalid. No I/O.

import type {
  CurriculumId,
  ProblemId,
  RecommendationId,
  TopicId,
  UserId,
} from "./ids.js";
import { newRecommendationId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";
import type { Curriculum, CurriculumTopic } from "./curriculum.js";
import type { Problem, ProblemDifficulty } from "./problem.js";
import type { UserProfile } from "./profile.js";
import type { UserCurriculumProgress, UserSkillState } from "./skill.js";

// Locked decision 5: the five recommendation intents.
export const RECOMMENDATION_TYPES = [
  "new_topic",
  "continue_topic",
  "reinforce_weakness",
  "review_topic",
  "advance_topic",
] as const;

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export function isRecommendationType(value: string): value is RecommendationType {
  return (RECOMMENDATION_TYPES as readonly string[]).includes(value);
}

// `active` is the current proposal; `accepted` means the user started it;
// `superseded` is a replaced proposal (Phase 12 regenerates after evaluation).
export const RECOMMENDATION_STATUSES = ["active", "accepted", "superseded"] as const;

export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export function isRecommendationStatus(value: string): value is RecommendationStatus {
  return (RECOMMENDATION_STATUSES as readonly string[]).includes(value);
}

// Where the recommendation came from: the server-side LLM, or the
// deterministic fallback (unconfigured/invalid model output).
export const RECOMMENDATION_SOURCES = ["llm", "fallback"] as const;

export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];

export function isRecommendationSource(value: string): value is RecommendationSource {
  return (RECOMMENDATION_SOURCES as readonly string[]).includes(value);
}

export const MAX_RECOMMENDATION_REASON_LENGTH = 500;
export const MAX_RECOMMENDATION_CANDIDATES = 12;

export interface Recommendation {
  readonly id: RecommendationId;
  readonly userId: UserId;
  readonly curriculumId: CurriculumId;
  readonly recommendationType: RecommendationType;
  readonly topicId: TopicId;
  readonly problemId: ProblemId;
  readonly reason: string;
  readonly source: RecommendationSource;
  readonly status: RecommendationStatus;
  readonly acceptedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Untyped create input (HTTP/service/test): validation happens here.
export interface CreateRecommendationInput {
  readonly userId: UserId;
  readonly curriculumId: CurriculumId;
  readonly recommendationType: unknown;
  readonly topicId: unknown;
  readonly problemId: unknown;
  readonly reason: unknown;
  readonly source: unknown;
  readonly status?: unknown;
  readonly acceptedAt?: Date;
  readonly now?: Date;
  readonly id?: RecommendationId;
}

function normalizeReason(raw: unknown): Result<string> {
  if (typeof raw !== "string") {
    return err(domainError("VALIDATION_ERROR", "reason must be a string"));
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return err(domainError("VALIDATION_ERROR", "reason must not be empty"));
  }
  if (trimmed.length > MAX_RECOMMENDATION_REASON_LENGTH) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `reason must be at most ${MAX_RECOMMENDATION_REASON_LENGTH} characters`,
      ),
    );
  }
  return ok(trimmed);
}

function nonEmptyId(raw: unknown, field: string): Result<string> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return err(domainError("VALIDATION_ERROR", `${field} must be a non-empty string`));
  }
  return ok(raw.trim());
}

export function createRecommendation(
  input: CreateRecommendationInput,
): Result<Recommendation> {
  if (!isRecommendationType(input.recommendationType as string)) {
    return err(
      domainError("VALIDATION_ERROR", `Unknown recommendationType: ${String(input.recommendationType)}`, {
        allowed: RECOMMENDATION_TYPES,
      }),
    );
  }
  const topicId = nonEmptyId(input.topicId, "topicId");
  if (!topicId.ok) return topicId;
  const problemId = nonEmptyId(input.problemId, "problemId");
  if (!problemId.ok) return problemId;
  const reason = normalizeReason(input.reason);
  if (!reason.ok) return reason;
  if (!isRecommendationSource(input.source as string)) {
    return err(
      domainError("VALIDATION_ERROR", `Unknown source: ${String(input.source)}`, {
        allowed: RECOMMENDATION_SOURCES,
      }),
    );
  }
  const status = input.status ?? "active";
  if (!isRecommendationStatus(status as string)) {
    return err(
      domainError("VALIDATION_ERROR", `Unknown status: ${String(status)}`, {
        allowed: RECOMMENDATION_STATUSES,
      }),
    );
  }
  const now = input.now ?? new Date();
  return ok({
    id: input.id ?? newRecommendationId(),
    userId: input.userId,
    curriculumId: input.curriculumId,
    recommendationType: input.recommendationType as RecommendationType,
    topicId: topicId.value as TopicId,
    problemId: problemId.value as ProblemId,
    reason: reason.value,
    source: input.source as RecommendationSource,
    status: status as RecommendationStatus,
    ...(input.acceptedAt === undefined ? {} : { acceptedAt: input.acceptedAt }),
    createdAt: now,
    updatedAt: now,
  });
}

// active -> accepted. Idempotent for an already-accepted recommendation;
// a superseded proposal can no longer be accepted.
export function acceptRecommendation(
  existing: Recommendation,
  now: Date = new Date(),
): Result<Recommendation> {
  if (existing.status === "superseded") {
    return err(
      domainError("CONFLICT", "Recommendation has been superseded and can no longer be accepted"),
    );
  }
  if (existing.status === "accepted") return ok(existing);
  return ok({ ...existing, status: "accepted", acceptedAt: now, updatedAt: now });
}

// Any non-superseded proposal -> superseded. Idempotent.
export function supersedeRecommendation(
  existing: Recommendation,
  now: Date = new Date(),
): Result<Recommendation> {
  if (existing.status === "superseded") return ok(existing);
  return ok({ ...existing, status: "superseded", updatedAt: now });
}

// Candidate set + deterministic fallback

export interface RecommendationCandidate {
  readonly recommendationType: RecommendationType;
  readonly topicId: TopicId;
  readonly topicName: string;
  readonly problemId: ProblemId;
  readonly problemTitle: string;
  readonly difficulty: ProblemDifficulty;
  /** Deterministic rationale; doubles as the fallback reason. */
  readonly reason: string;
}

export interface RecommendationCandidateSet {
  readonly curriculumId: CurriculumId;
  readonly candidates: readonly RecommendationCandidate[];
}

export interface BuildRecommendationCandidatesInput {
  readonly curriculum: Curriculum;
  readonly problems: readonly Problem[];
  readonly skills?: readonly UserSkillState[];
  readonly progress?: UserCurriculumProgress | null;
  /** Clamp on the candidate list fed to the model (default 12). */
  readonly limit?: number;
}

function orderedTopics(curriculum: Curriculum): readonly CurriculumTopic[] {
  return [...curriculum.topics].sort((a, b) => a.order - b.order);
}

// Deterministic within-topic choice: advance through the topic's problems by
// the number of successful attempts so far, clamping to the last problem. No
// per-problem completion state exists in Phase 3, so this is the best stable
// proxy and it keeps "continue_topic" meaningful.
function pickProblemForTopic(
  topic: CurriculumTopic,
  skill: UserSkillState | undefined,
  problemById: ReadonlyMap<ProblemId, Problem>,
): Problem | null {
  const problems = topic.problemIds
    .map((id) => problemById.get(id))
    .filter((p): p is Problem => p !== undefined);
  if (problems.length === 0) return null;
  const index = Math.min(skill?.successfulAttempts ?? 0, problems.length - 1);
  return problems[index] ?? null;
}

// Collects deduplicated recommendation candidates in pedagogical priority
// order. Extracted from buildRecommendationCandidates (audit F-22) so the
// entry point reads as the five priority phases plus the limit.
class CandidateCollector {
  private readonly candidates: RecommendationCandidate[] = [];
  private readonly seenProblems = new Set<ProblemId>();

  constructor(
    private readonly skillByTopic: Map<TopicId, UserSkillState>,
    private readonly problemById: Map<ProblemId, Problem>,
  ) {}

  add(
    topic: CurriculumTopic | undefined,
    recommendationType: RecommendationType,
    reason: string,
  ): void {
    if (topic === undefined) return;
    const skill = this.skillByTopic.get(topic.id);
    const problem = pickProblemForTopic(topic, skill, this.problemById);
    if (problem === null || this.seenProblems.has(problem.id)) return;
    this.seenProblems.add(problem.id);
    this.candidates.push({
      recommendationType,
      topicId: topic.id,
      topicName: topic.name,
      problemId: problem.id,
      problemTitle: problem.title,
      difficulty: problem.difficulty,
      reason,
    });
  }

  finish(curriculumId: CurriculumId, limit: number | undefined): RecommendationCandidateSet {
    const capped = Math.min(
      MAX_RECOMMENDATION_CANDIDATES,
      Math.max(1, Math.floor(limit ?? MAX_RECOMMENDATION_CANDIDATES)),
    );
    return {
      curriculumId,
      candidates: this.candidates.slice(0, capped),
    };
  }
}

// Builds the ordered candidate set the model may choose from (and the
// fallback picks from). Order encodes pedagogical priority:
//   continue/reinforce the current topic -> advance/new -> review mastered.
export function buildRecommendationCandidates(
  input: BuildRecommendationCandidatesInput,
): RecommendationCandidateSet {
  const problemById = new Map<ProblemId, Problem>();
  for (const problem of input.problems) problemById.set(problem.id, problem);
  const skillByTopic = new Map<TopicId, UserSkillState>();
  for (const skill of input.skills ?? []) skillByTopic.set(skill.topicId, skill);

  const topics = orderedTopics(input.curriculum);
  const currentTopicId = input.progress?.currentTopicId;
  const currentIndex = Math.max(
    0,
    topics.findIndex((topic) => topic.id === currentTopicId),
  );
  const currentTopic = topics[currentIndex];
  const collector = new CandidateCollector(skillByTopic, problemById);

  // 1. Current topic: keep going if started, otherwise start it.
  if (currentTopic !== undefined && skillByTopic.get(currentTopic.id)?.masteryLevel !== "mastered") {
    const skill = skillByTopic.get(currentTopic.id);
    if (skill === undefined) {
      collector.add(currentTopic, "new_topic", `Start ${currentTopic.name}, the first topic in your curriculum.`);
    } else {
      collector.add(
        currentTopic,
        "continue_topic",
        `Keep building on ${currentTopic.name} (${skill.masteryLevel}).`,
      );
    }
  }

  // 2. Weak topics anywhere in the curriculum (last outcome partial/failure).
  for (const topic of topics) {
    const skill = skillByTopic.get(topic.id);
    if (
      skill !== undefined &&
      (skill.lastOutcome === "failure" || skill.lastOutcome === "partial") &&
      skill.masteryLevel !== "mastered"
    ) {
      collector.add(topic, "reinforce_weakness", `Reinforce ${topic.name} where your last attempt was ${skill.lastOutcome}.`);
    }
  }

  // 3. Forward progression: the next unmastered topic after the current one.
  const currentMastered =
    currentTopic !== undefined &&
    skillByTopic.get(currentTopic.id)?.masteryLevel === "mastered";
  for (let i = currentIndex + 1; i < topics.length; i += 1) {
    const topic = topics[i];
    if (topic === undefined) continue;
    const skill = skillByTopic.get(topic.id);
    if (skill?.masteryLevel === "mastered") continue;
    collector.add(
      topic,
      currentMastered ? "advance_topic" : "new_topic",
      currentMastered
        ? `Advance to ${topic.name} after mastering ${currentTopic?.name ?? "the previous topic"}.`
        : `Explore ${topic.name} next in your curriculum.`,
    );
  }

  // 4. Spaced review of mastered topics (retention), lowest priority.
  for (const topic of topics) {
    if (skillByTopic.get(topic.id)?.masteryLevel === "mastered") {
      collector.add(topic, "review_topic", `Review ${topic.name} to keep it sharp.`);
    }
  }

  // Any remaining topics (e.g. the current one was mastered and already
  // reviewed) still get an option so the set is never empty for a non-empty
  // curriculum.
  for (const topic of topics) {
    collector.add(topic, "new_topic", `Explore ${topic.name}.`);
  }

  return collector.finish(input.curriculum.id, input.limit);
}

// Model port + validation

// The raw, unvalidated shape the LLM is asked to return.
export interface RecommendationProposal {
  readonly recommendationType: string;
  readonly topicId: string;
  readonly problemId: string;
  readonly reason: string;
}

export interface RecommendationModelInput {
  readonly profile: UserProfile | null;
  readonly candidateSet: RecommendationCandidateSet;
  readonly skills: readonly UserSkillState[];
  readonly progress: UserCurriculumProgress | null;
}

// A model failure is not an exception: `proposal: null` (with a diagnostic
// `error`) tells the service to fall back deterministically.
export interface RecommendationModelResult {
  readonly proposal: RecommendationProposal | null;
  readonly error?: string;
}

export interface RecommendationModel {
  readonly name: string;
  recommend(input: RecommendationModelInput): Promise<RecommendationModelResult>;
}

export interface ValidatedRecommendation {
  readonly recommendationType: RecommendationType;
  readonly candidate: RecommendationCandidate;
  readonly reason: string;
}

// Validates an LLM proposal against the backend-built candidate set: the
// proposed (topicId, problemId) must be one of the candidates, the type must be
// a known recommendation type, and the reason must be present. The candidate
// supplies canonical titles/difficulty, so model output never becomes truth.
export function validateRecommendationProposal(
  proposal: RecommendationProposal,
  candidateSet: RecommendationCandidateSet,
): Result<ValidatedRecommendation> {
  if (!isRecommendationType(proposal.recommendationType)) {
    return err(
      domainError("VALIDATION_ERROR", `Unknown recommendationType: ${String(proposal.recommendationType)}`, {
        allowed: RECOMMENDATION_TYPES,
      }),
    );
  }
  const candidate = candidateSet.candidates.find(
    (c) => c.problemId === proposal.problemId && c.topicId === proposal.topicId,
  );
  if (candidate === undefined) {
    return err(
      domainError("VALIDATION_ERROR", "Proposed topic/problem is not in the candidate set"),
    );
  }
  const reason = normalizeReason(proposal.reason);
  if (!reason.ok) return reason;
  return ok({
    recommendationType: proposal.recommendationType,
    candidate,
    reason: reason.value,
  });
}

// The deterministic fallback: the highest-priority candidate. Always defined
// for a non-empty candidate set.
export function fallbackRecommendation(
  candidateSet: RecommendationCandidateSet,
): ValidatedRecommendation | null {
  const candidate = candidateSet.candidates[0];
  if (candidate === undefined) return null;
  return {
    recommendationType: candidate.recommendationType,
    candidate,
    reason: candidate.reason,
  };
}
