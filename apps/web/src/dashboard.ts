// @interview-coach/web - Dashboard derivations (Phase 5).
//
// Pure functions over server-owned state (profile, recommendation, curriculum,
// skill state). The Dashboard renders these; it never derives learning state
// from browser storage. Every value here is a presentation mapping of a
// backend response - the backend remains the system of record.

import type {
  MasteryLevel,
  ProblemContent,
  RecommendationSource,
  RecommendationType,
  SerializedCurriculum,
  SerializedRecommendation,
  SerializedUserCurriculumProgress,
  SerializedUserProfile,
  SerializedUserSkillState,
} from "./api/types.js";
import { interviewTypeLabel, levelLabel, roleLabel } from "./profile-taxonomy.js";

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  not_started: "Not started",
  learning: "Learning",
  developing: "Developing",
  proficient: "Proficient",
  mastered: "Mastered",
};

const MASTERY_RANK: Record<MasteryLevel, number> = {
  not_started: 0,
  learning: 1,
  developing: 2,
  proficient: 3,
  mastered: 4,
};

export function masteryLabel(level: string): string {
  return MASTERY_LABELS[level as MasteryLevel] ?? level;
}

export function masteryRank(level: string): number {
  return MASTERY_RANK[level as MasteryLevel] ?? 0;
}

export const RECOMMENDATION_TYPE_LABELS: Record<RecommendationType, string> = {
  new_topic: "New topic",
  continue_topic: "Continue topic",
  reinforce_weakness: "Reinforce weakness",
  review_topic: "Review topic",
  advance_topic: "Advance",
};

export function recommendationTypeLabel(type: string): string {
  return RECOMMENDATION_TYPE_LABELS[type as RecommendationType] ?? type.replace(/_/g, " ");
}

export function recommendationSourceLabel(source: RecommendationSource): string {
  return source === "llm" ? "AI recommendation" : "Curriculum default";
}

// "Preparing for Senior Backend Engineer · Data Structures & Algorithms"
export function preparingForLabel(profile: SerializedUserProfile): string {
  const type =
    profile.interviewTypes.map(interviewTypeLabel).join(", ") || "Interview practice";
  return `${levelLabel(profile.level)} ${roleLabel(profile.role)} · ${type}`;
}

export interface TopicRef {
  readonly id: string;
  readonly name: string;
  readonly moduleName: string | null;
}

export function findTopic(
  curriculum: SerializedCurriculum | null,
  topicId: string | null | undefined,
): TopicRef | null {
  if (curriculum === null || topicId === null || topicId === undefined) return null;
  const topic = curriculum.topics.find((t) => t.id === topicId);
  if (topic === undefined) return null;
  const module = curriculum.modules.find((m) => m.id === topic.moduleId);
  return { id: topic.id, name: topic.name, moduleName: module?.name ?? null };
}

export interface RecommendationView {
  readonly typeLabel: string;
  readonly topicName: string;
  readonly moduleName: string | null;
  readonly problemTitle: string | null;
  readonly problemDifficulty: string | null;
  readonly reason: string;
  readonly source: RecommendationSource;
}

export function buildRecommendationView(
  recommendation: SerializedRecommendation,
  curriculum: SerializedCurriculum | null,
  problem: ProblemContent | null,
): RecommendationView {
  const topic = findTopic(curriculum, recommendation.topicId);
  return {
    typeLabel: recommendationTypeLabel(recommendation.recommendationType),
    topicName: topic?.name ?? recommendation.topicId,
    moduleName: topic?.moduleName ?? null,
    problemTitle: problem?.title ?? null,
    problemDifficulty: problem?.difficulty ?? null,
    reason: recommendation.reason,
    source: recommendation.source,
  };
}

export interface ModuleProgressView {
  readonly id: string;
  readonly name: string;
  readonly total: number;
  readonly started: number;
  readonly mastered: number;
}

export interface CurriculumProgressView {
  readonly totalTopics: number;
  readonly startedTopics: number;
  readonly masteredTopics: number;
  readonly completedTopics: number;
  readonly percent: number;
  readonly currentTopicName: string | null;
  readonly modules: readonly ModuleProgressView[];
}

export function buildCurriculumProgress(
  curriculum: SerializedCurriculum | null,
  skills: readonly SerializedUserSkillState[],
  progress: SerializedUserCurriculumProgress | null,
): CurriculumProgressView {
  const topics = curriculum?.topics ?? [];
  const byTopic = new Map(skills.map((skill) => [skill.topicId, skill]));
  const completed = progress?.completedTopicIds ?? [];
  const startedTopics = skills.filter((skill) => skill.masteryLevel !== "not_started").length;
  const masteredTopics = skills.filter((skill) => skill.masteryLevel === "mastered").length;
  const modules = (curriculum?.modules ?? []).map((module) => {
    let started = 0;
    let mastered = 0;
    for (const id of module.topicIds) {
      const skill = byTopic.get(id);
      if (skill !== undefined && skill.masteryLevel !== "not_started") started += 1;
      if (skill?.masteryLevel === "mastered") mastered += 1;
    }
    return { id: module.id, name: module.name, total: module.topicIds.length, started, mastered };
  });
  return {
    totalTopics: topics.length,
    startedTopics,
    masteredTopics,
    completedTopics: completed.length,
    percent: topics.length === 0 ? 0 : Math.round((completed.length / topics.length) * 100),
    currentTopicName: findTopic(curriculum, progress?.currentTopicId)?.name ?? null,
    modules,
  };
}

export interface StrengthsWeaknessesView {
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
}

function rankedNotes(groups: readonly (readonly string[])[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    for (const raw of group) {
      const label = raw.trim();
      if (label === "") continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

// Aggregates the explicit strengths/weaknesses the backend persisted per topic.
// When a user has skill state but no notes yet, falls back to topic-level
// mastery (mastered/proficient → strength; learning or a failed last outcome →
// weakness) so the card is never empty once practice has happened.
export function buildStrengthsWeaknesses(
  skills: readonly SerializedUserSkillState[],
  curriculum: SerializedCurriculum | null,
): StrengthsWeaknessesView {
  let strengths = rankedNotes(skills.map((skill) => skill.strengths));
  let weaknesses = rankedNotes(skills.map((skill) => skill.weaknesses));
  if (strengths.length === 0) {
    strengths = skills
      .filter((skill) => masteryRank(skill.masteryLevel) >= MASTERY_RANK.proficient)
      .map((skill) => findTopic(curriculum, skill.topicId)?.name ?? skill.topicId);
  }
  if (weaknesses.length === 0) {
    weaknesses = skills
      .filter((skill) => skill.lastOutcome === "failure" || skill.masteryLevel === "learning")
      .map((skill) => findTopic(curriculum, skill.topicId)?.name ?? skill.topicId);
  }
  return { strengths: strengths.slice(0, 6), weaknesses: weaknesses.slice(0, 6) };
}
