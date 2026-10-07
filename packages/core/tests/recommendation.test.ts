// Phase 4 recommendation domain: deterministic candidate set + fallback,
// proposal validation, entity validation, and status transitions.

import { describe, expect, it } from "vitest";
import {
  acceptRecommendation,
  asCurriculumId,
  asModuleId,
  asProblemId,
  asTopicId,
  asUserId,
  buildRecommendationCandidates,
  createProblem,
  createRecommendation,
  createUserCurriculumProgress,
  createUserSkillState,
  fallbackRecommendation,
  supersedeRecommendation,
  validateRecommendationProposal,
  type Curriculum,
  type Problem,
  type UserCurriculumProgress,
  type UserSkillState,
} from "../src/index.js";
import { must, mustErr } from "./helpers.js";

const CURRICULUM_ID = asCurriculumId("dsa");
const USER = asUserId("user_test");
const T1 = asTopicId("topic_arrays");
const T2 = asTopicId("topic_strings");
const T3 = asTopicId("topic_trees");

function problem(id: string, title: string, difficulty: Problem["difficulty"] = "Easy"): Problem {
  return must(createProblem({ id: asProblemId(id), title, difficulty }));
}

const P1A = problem("prob_a1", "Array One");
const P1B = problem("prob_a2", "Array Two");
const P2A = problem("prob_b1", "String One");
const P3A = problem("prob_c1", "Tree One");

const curriculum: Curriculum = {
  id: CURRICULUM_ID,
  interviewType: "dsa",
  name: "DSA",
  version: 1,
  modules: [
    {
      id: asModuleId("module_1"),
      curriculumId: CURRICULUM_ID,
      order: 1,
      name: "Foundations",
      topicIds: [T1, T2, T3],
    },
  ],
  topics: [
    { id: T1, curriculumId: CURRICULUM_ID, moduleId: asModuleId("module_1"), order: 1, name: "Arrays", problemIds: [P1A.id, P1B.id] },
    { id: T2, curriculumId: CURRICULUM_ID, moduleId: asModuleId("module_1"), order: 2, name: "Strings", problemIds: [P2A.id] },
    { id: T3, curriculumId: CURRICULUM_ID, moduleId: asModuleId("module_1"), order: 3, name: "Trees", problemIds: [P3A.id] },
  ],
};

const PROBLEMS = [P1A, P1B, P2A, P3A];

function skill(topicId: typeof T1, overrides: Partial<Parameters<typeof createUserSkillState>[0]> = {}): UserSkillState {
  return must(
    createUserSkillState({
      userId: USER,
      curriculumId: CURRICULUM_ID,
      topicId,
      ...overrides,
    }),
  );
}

function progress(currentTopicId?: typeof T1): UserCurriculumProgress {
  return must(
    createUserCurriculumProgress({
      userId: USER,
      curriculumId: CURRICULUM_ID,
      ...(currentTopicId === undefined ? {} : { currentTopicId }),
    }),
  );
}

describe("buildRecommendationCandidates", () => {
  it("is deterministic and starts a new user on the first topic", () => {
    const a = buildRecommendationCandidates({ curriculum, problems: PROBLEMS });
    const b = buildRecommendationCandidates({ curriculum, problems: PROBLEMS });
    expect(a.candidates.map((c) => c.problemId)).toEqual(b.candidates.map((c) => c.problemId));
    expect(a.candidates[0]).toMatchObject({
      recommendationType: "new_topic",
      topicId: T1,
      problemId: P1A.id,
    });
  });

  it("continues the current topic and advances within it by successful attempts", () => {
    const set = buildRecommendationCandidates({
      curriculum,
      problems: PROBLEMS,
      skills: [skill(T1, { masteryLevel: "learning", successfulAttempts: 1, totalAttempts: 1 })],
      progress: progress(T1),
    });
    expect(set.candidates[0]).toMatchObject({
      recommendationType: "continue_topic",
      topicId: T1,
      problemId: P1B.id,
    });
  });

  it("surfaces weak topics as reinforce_weakness", () => {
    const set = buildRecommendationCandidates({
      curriculum,
      problems: PROBLEMS,
      skills: [skill(T1, { lastOutcome: "failure", totalAttempts: 1 })],
      progress: progress(T2),
    });
    const reinforce = set.candidates.find((c) => c.topicId === T1);
    expect(reinforce?.recommendationType).toBe("reinforce_weakness");
    expect(set.candidates[0]?.topicId).toBe(T2);
  });

  it("advances past a mastered current topic", () => {
    const set = buildRecommendationCandidates({
      curriculum,
      problems: PROBLEMS,
      skills: [skill(T1, { masteryLevel: "mastered", successfulAttempts: 3, totalAttempts: 3 })],
      progress: progress(T1),
    });
    const next = set.candidates.find((c) => c.topicId === T2);
    expect(next?.recommendationType).toBe("advance_topic");
  });

  it("offers mastered topics for review and always yields a fallback", () => {
    const set = buildRecommendationCandidates({
      curriculum,
      problems: PROBLEMS,
      skills: [skill(T1, { masteryLevel: "mastered", successfulAttempts: 3, totalAttempts: 3 })],
      progress: progress(T1),
    });
    const review = set.candidates.find((c) => c.topicId === T1);
    expect(review?.recommendationType).toBe("review_topic");
    expect(fallbackRecommendation(set)).not.toBeNull();
  });

  it("caps the candidate list", () => {
    const set = buildRecommendationCandidates({ curriculum, problems: PROBLEMS, limit: 2 });
    expect(set.candidates).toHaveLength(2);
  });
});

describe("validateRecommendationProposal", () => {
  const set = buildRecommendationCandidates({ curriculum, problems: PROBLEMS });

  it("accepts a candidate-set member and canonicalizes metadata", () => {
    const validated = must(
      validateRecommendationProposal(
        { recommendationType: "reinforce_weakness", topicId: T1, problemId: P1A.id, reason: "  Practice arrays  " },
        set,
      ),
    );
    expect(validated.recommendationType).toBe("reinforce_weakness");
    expect(validated.reason).toBe("Practice arrays");
    expect(validated.candidate.problemTitle).toBe("Array One");
  });

  it("rejects an unknown type, a foreign pair, and an empty reason", () => {
    expect(
      mustErr(validateRecommendationProposal({ recommendationType: "go_nuts", topicId: T1, problemId: P1A.id, reason: "x" }, set)),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(validateRecommendationProposal({ recommendationType: "new_topic", topicId: T3, problemId: P1A.id, reason: "x" }, set)),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(validateRecommendationProposal({ recommendationType: "new_topic", topicId: T1, problemId: P1A.id, reason: "   " }, set)),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("recommendation entity", () => {
  it("validates create input", () => {
    expect(
      mustErr(
        createRecommendation({
          userId: USER,
          curriculumId: CURRICULUM_ID,
          recommendationType: "nope",
          topicId: T1,
          problemId: P1A.id,
          reason: "x",
          source: "llm",
        }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        createRecommendation({
          userId: USER,
          curriculumId: CURRICULUM_ID,
          recommendationType: "new_topic",
          topicId: T1,
          problemId: P1A.id,
          reason: "x",
          source: "magic",
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("transitions active -> accepted and refuses a superseded accept", () => {
    const rec = must(
      createRecommendation({
        userId: USER,
        curriculumId: CURRICULUM_ID,
        recommendationType: "new_topic",
        topicId: T1,
        problemId: P1A.id,
        reason: "Start here",
        source: "fallback",
      }),
    );
    const accepted = must(acceptRecommendation(rec));
    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptedAt).toBeInstanceOf(Date);
    expect(must(acceptRecommendation(accepted)).status).toBe("accepted");
    const superseded = must(supersedeRecommendation(rec));
    expect(superseded.status).toBe("superseded");
    expect(mustErr(acceptRecommendation(superseded))).toBe("CONFLICT");
  });
});
