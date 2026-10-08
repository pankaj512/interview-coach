// Phase 5 dashboard derivations: pure mappings from server state to the
// Dashboard's presentation model. No network, no React.

import { describe, expect, it } from "vitest";
import type {
  ProblemContent,
  SerializedCurriculum,
  SerializedRecommendation,
  SerializedUserCurriculumProgress,
  SerializedUserProfile,
  SerializedUserSkillState,
} from "../src/api/types.js";
import {
  buildCurriculumProgress,
  buildRecommendationView,
  buildStrengthsWeaknesses,
  masteryLabel,
  masteryRank,
  preparingForLabel,
  recommendationTypeLabel,
} from "../src/dashboard.js";

const AT = "2026-09-14T00:00:00.000Z";

const profile: SerializedUserProfile = {
  userId: "user_1",
  interviewTypes: ["dsa"],
  role: "backend_engineer",
  level: "senior",
  createdAt: AT,
  updatedAt: AT,
};

const curriculum: SerializedCurriculum = {
  id: "dsa",
  interviewType: "dsa",
  name: "DSA Interview Curriculum",
  version: 1,
  modules: [
    {
      id: "mod_foundations",
      curriculumId: "dsa",
      order: 1,
      name: "Foundations",
      topicIds: ["topic_arrays", "topic_strings"],
    },
  ],
  topics: [
    {
      id: "topic_arrays",
      curriculumId: "dsa",
      moduleId: "mod_foundations",
      order: 1,
      name: "Arrays",
      problemIds: ["prob_move-zeroes"],
    },
    {
      id: "topic_strings",
      curriculumId: "dsa",
      moduleId: "mod_foundations",
      order: 2,
      name: "Strings",
      problemIds: ["prob_valid-palindrome"],
    },
  ],
};

const recommendation: SerializedRecommendation = {
  id: "rec_1",
  userId: "user_1",
  curriculumId: "dsa",
  recommendationType: "new_topic",
  topicId: "topic_arrays",
  problemId: "prob_move-zeroes",
  reason: "Start with array fundamentals.",
  source: "fallback",
  status: "active",
  createdAt: AT,
  updatedAt: AT,
};

const problem: ProblemContent = {
  id: "prob_move-zeroes",
  title: "Move Zeroes",
  difficulty: "Easy",
  description: null,
  constraints: null,
  examples: null,
  starters: null,
  runnerLinks: null,
};

function skill(overrides: Partial<SerializedUserSkillState>): SerializedUserSkillState {
  return {
    userId: "user_1",
    curriculumId: "dsa",
    topicId: "topic_arrays",
    masteryLevel: "learning",
    successfulAttempts: 0,
    totalAttempts: 0,
    strengths: [],
    weaknesses: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

const skills: readonly SerializedUserSkillState[] = [
  skill({
    topicId: "topic_arrays",
    masteryLevel: "proficient",
    successfulAttempts: 2,
    totalAttempts: 3,
    strengths: ["Clear communication"],
    weaknesses: ["Edge cases"],
  }),
  skill({
    topicId: "topic_strings",
    masteryLevel: "learning",
    successfulAttempts: 0,
    totalAttempts: 1,
    lastOutcome: "failure",
    weaknesses: ["Edge cases", "Complexity analysis"],
  }),
];

const progress: SerializedUserCurriculumProgress = {
  userId: "user_1",
  curriculumId: "dsa",
  currentTopicId: "topic_strings",
  completedTopicIds: ["topic_arrays"],
  createdAt: AT,
  updatedAt: AT,
};

describe("dashboard derivations", () => {
  it("labels the preparing-for header from the profile taxonomy", () => {
    expect(preparingForLabel(profile)).toBe("Senior Backend Engineer · Data Structures & Algorithms");
  });

  it("maps mastery levels and recommendation types to labels", () => {
    expect(masteryLabel("proficient")).toBe("Proficient");
    expect(masteryRank("mastered")).toBeGreaterThan(masteryRank("learning"));
    expect(recommendationTypeLabel("reinforce_weakness")).toBe("Reinforce weakness");
  });

  it("resolves the recommendation's topic, module, and problem", () => {
    const view = buildRecommendationView(recommendation, curriculum, problem);
    expect(view).toMatchObject({
      typeLabel: "New topic",
      topicName: "Arrays",
      moduleName: "Foundations",
      problemTitle: "Move Zeroes",
      problemDifficulty: "Easy",
      source: "fallback",
    });
  });

  it("falls back to the topic id when the curriculum is unavailable", () => {
    const view = buildRecommendationView(recommendation, null, null);
    expect(view.topicName).toBe("topic_arrays");
    expect(view.problemTitle).toBeNull();
  });

  it("computes curriculum progress from skills + the progress pointer", () => {
    const view = buildCurriculumProgress(curriculum, skills, progress);
    expect(view.totalTopics).toBe(2);
    expect(view.completedTopics).toBe(1);
    expect(view.percent).toBe(50);
    expect(view.startedTopics).toBe(2);
    expect(view.masteredTopics).toBe(0);
    expect(view.currentTopicName).toBe("Strings");
    expect(view.modules).toEqual([
      { id: "mod_foundations", name: "Foundations", total: 2, started: 2, mastered: 0 },
    ]);
  });

  it("ranks explicit strengths/weaknesses notes by frequency", () => {
    const { strengths, weaknesses } = buildStrengthsWeaknesses(skills, curriculum);
    expect(strengths).toEqual(["Clear communication"]);
    expect(weaknesses).toEqual(["Edge cases", "Complexity analysis"]);
  });

  it("falls back to topic mastery when no notes exist", () => {
    const bare = [
      skill({ topicId: "topic_arrays", masteryLevel: "mastered" }),
      skill({ topicId: "topic_strings", masteryLevel: "learning" }),
    ];
    const { strengths, weaknesses } = buildStrengthsWeaknesses(bare, curriculum);
    expect(strengths).toEqual(["Arrays"]);
    expect(weaknesses).toEqual(["Strings"]);
  });
});
