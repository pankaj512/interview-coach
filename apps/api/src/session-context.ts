// @interview-coach/api - realtime session context assembly.
//
// Owns: turning server-owned profile/curriculum/skill state into short
// summaries injected into the voice-session mint. Surprising: pure and
// best-effort (every input optional, degrades to generic); no LLM here.
//
// History: Phase 7; see docs/SESSION_HANDOFF.md.

import {
  INTERVIEW_TYPE_LABELS,
  MASTERY_LEVEL_LABELS,
  PROFILE_LEVEL_LABELS,
  PROFILE_ROLE_LABELS,
  type Curriculum,
  type CurriculumModule,
  type CurriculumTopic,
  type Problem,
  type UserProfile,
  type UserSkillState,
} from "@interview-coach/core";

export interface SessionContext {
  /** Who the candidate is preparing to be + their stated goal. */
  readonly profileSummary?: string;
  /** Recommended topic name (+ owning module). */
  readonly topicSummary?: string;
  /** The topic/module learning objective. */
  readonly objectiveSummary?: string;
  /** Prior mastery + strengths/focus areas for the topic. */
  readonly skillSummary?: string;
}

export interface AssembleSessionContextInput {
  readonly profile: UserProfile | null;
  readonly curriculum: Curriculum | null;
  readonly skills: readonly UserSkillState[];
  readonly problem: Problem | null;
}

export interface TopicLookup {
  readonly topic: CurriculumTopic;
  readonly module: CurriculumModule | null;
}

// Resolves the curriculum topic for a problem: prefer the problem's own
// topicId (Phase 3 sets it from the catalog) and fall back to membership scan
// for catalog problems seeded before that linkage.
export function findTopicForProblem(
  curriculum: Curriculum | null,
  problem: Problem | null,
): TopicLookup | null {
  if (curriculum === null || problem === null) return null;
  const byId =
    problem.topicId === undefined
      ? undefined
      : curriculum.topics.find((topic) => topic.id === problem.topicId);
  const topic =
    byId ?? curriculum.topics.find((candidate) => candidate.problemIds.includes(problem.id));
  if (topic === undefined) return null;
  const module = curriculum.modules.find((m) => m.id === topic.moduleId) ?? null;
  return { topic, module };
}

export function buildProfileSummary(profile: UserProfile): string {
  const types = profile.interviewTypes.map((type) => INTERVIEW_TYPE_LABELS[type]).join(", ");
  const base = `Preparing for ${PROFILE_LEVEL_LABELS[profile.level]} ${PROFILE_ROLE_LABELS[profile.role]} (${types})`;
  return profile.goals === undefined || profile.goals === "" ? base : `${base}. Stated goal: ${profile.goals}`;
}

export function buildTopicSummary(lookup: TopicLookup): string {
  return lookup.module === null
    ? lookup.topic.name
    : `${lookup.topic.name} (module: ${lookup.module.name})`;
}

export function buildObjectiveSummary(lookup: TopicLookup): string | undefined {
  const objective = lookup.module?.objective?.trim().replace(/\.+$/, "");
  return objective === undefined || objective === "" ? undefined : objective;
}

export function buildSkillSummary(skill: UserSkillState | null): string | undefined {
  if (skill === null) return undefined;
  const parts = [
    `mastery ${MASTERY_LEVEL_LABELS[skill.masteryLevel]}`,
    `${skill.successfulAttempts}/${skill.totalAttempts} successful attempts`,
  ];
  if (skill.strengths.length > 0) parts.push(`strengths: ${skill.strengths.join("; ")}`);
  if (skill.weaknesses.length > 0) parts.push(`focus areas: ${skill.weaknesses.join("; ")}`);
  return parts.join("; ");
}

// Assembles the injected context. Never throws: a missing curriculum/problem
// drops the topic/objective/skill lines, and an unknown topic leaves the skill
// summary out rather than guessing.
export function assembleSessionContext(input: AssembleSessionContextInput): SessionContext {
  const lookup = findTopicForProblem(input.curriculum, input.problem);
  const topicId = lookup?.topic.id ?? input.problem?.topicId;
  const skill =
    topicId === undefined
      ? null
      : (input.skills.find((state) => state.topicId === topicId) ?? null);
  return {
    ...(input.profile === null ? {} : { profileSummary: buildProfileSummary(input.profile) }),
    ...(lookup === null ? {} : { topicSummary: buildTopicSummary(lookup) }),
    ...(lookup === null
      ? {}
      : (() => {
          const objective = buildObjectiveSummary(lookup);
          return objective === undefined ? {} : { objectiveSummary: objective };
        })()),
    ...(skill === null ? {} : (() => {
      const summary = buildSkillSummary(skill);
      return summary === undefined ? {} : { skillSummary: summary };
    })()),
  };
}
