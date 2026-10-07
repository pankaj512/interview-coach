// Phase 11: deterministic skill/curriculum update rules + planner.
import { describe, expect, it } from "vitest";
import {
  asCurriculumId,
  asInterviewId,
  asModuleId,
  asTopicId,
  asUserId,
} from "../src/ids.js";
import type { Curriculum, CurriculumModule, CurriculumTopic } from "../src/curriculum.js";
import { createEvaluation } from "../src/evaluation.js";
import {
  createUserCurriculumProgress,
  createUserSkillState,
} from "../src/skill.js";
import {
  DEFAULT_SKILL_UPDATE_POLICY,
  decideSkillAction,
  evaluateSkillOutcome,
  isStrongSuccess,
  masteryLevelFor,
  nextTopicId,
  planSkillUpdate,
  type SkillUpdatePolicy,
} from "../src/skill-update.js";
import { must } from "./helpers.js";

const USER = asUserId("user_1");
const CURRICULUM_ID = asCurriculumId("dsa");
const MODULE_ID = asModuleId("module_dsa_foundations");
const TOPIC_A = asTopicId("topic_arrays");
const TOPIC_B = asTopicId("topic_strings");
const TOPIC_C = asTopicId("topic_hashing");
const NOW = new Date("2026-09-15T10:00:00.000Z");

function topic(id: typeof TOPIC_A, order: number): CurriculumTopic {
  return {
    id,
    curriculumId: CURRICULUM_ID,
    moduleId: MODULE_ID,
    order,
    name: `Topic ${order}`,
    problemIds: [],
  };
}

const curriculum: Curriculum = {
  id: CURRICULUM_ID,
  interviewType: "dsa",
  name: "Test Curriculum",
  version: 1,
  modules: [
    {
      id: MODULE_ID,
      curriculumId: CURRICULUM_ID,
      order: 1,
      name: "Foundations",
      topicIds: [TOPIC_A, TOPIC_B, TOPIC_C],
    } satisfies CurriculumModule,
  ],
  topics: [topic(TOPIC_A, 1), topic(TOPIC_B, 2), topic(TOPIC_C, 3)],
};

function evaluation(options: {
  score?: number;
  recommendation?: "hire" | "lean_hire" | "lean_no_hire" | "no_hire";
  topicId?: typeof TOPIC_A;
  strengths?: string[];
  weaknesses?: string[];
}) {
  return must(
    createEvaluation({
      interviewId: asInterviewId("iv_1"),
      ...(options.topicId === undefined ? {} : { topicId: options.topicId }),
      ...(options.score === undefined ? {} : { overallScore: options.score }),
      ...(options.recommendation === undefined
        ? {}
        : { recommendation: options.recommendation }),
      strengths: options.strengths ?? [],
      weaknesses: options.weaknesses ?? [],
      now: NOW,
    }),
  );
}

describe("evaluateSkillOutcome", () => {
  it("bands by overall score", () => {
    expect(evaluateSkillOutcome(evaluation({ score: 90 }))).toBe("success");
    expect(evaluateSkillOutcome(evaluation({ score: 70 }))).toBe("success");
    expect(evaluateSkillOutcome(evaluation({ score: 60 }))).toBe("partial");
    expect(evaluateSkillOutcome(evaluation({ score: 50 }))).toBe("partial");
    expect(evaluateSkillOutcome(evaluation({ score: 20 }))).toBe("failure");
  });

  it("falls back to the recommendation without a score", () => {
    expect(evaluateSkillOutcome(evaluation({ recommendation: "hire" }))).toBe("success");
    expect(evaluateSkillOutcome(evaluation({ recommendation: "lean_no_hire" }))).toBe("partial");
    expect(evaluateSkillOutcome(evaluation({ recommendation: "no_hire" }))).toBe("failure");
  });

  it("treats a missing signal as neutral partial", () => {
    expect(evaluateSkillOutcome(evaluation({}))).toBe("partial");
  });
});

describe("isStrongSuccess", () => {
  it("requires a high score (or a hire recommendation)", () => {
    expect(isStrongSuccess(evaluation({ score: 85 }))).toBe(true);
    expect(isStrongSuccess(evaluation({ score: 84 }))).toBe(false);
    expect(isStrongSuccess(evaluation({ recommendation: "hire" }))).toBe(true);
  });
});

describe("masteryLevelFor", () => {
  it("maps successful attempts onto the locked thresholds", () => {
    expect(masteryLevelFor(0, false)).toBe("not_started");
    expect(masteryLevelFor(1, false)).toBe("learning");
    expect(masteryLevelFor(2, false)).toBe("developing");
    expect(masteryLevelFor(3, false)).toBe("proficient");
  });

  it("requires a strong success to master a topic", () => {
    expect(masteryLevelFor(3, true)).toBe("mastered");
    expect(masteryLevelFor(3, false)).toBe("proficient");
  });

  it("honours configurable thresholds", () => {
    const policy: SkillUpdatePolicy = {
      ...DEFAULT_SKILL_UPDATE_POLICY,
      thresholds: { learning: 1, developing: 1, proficient: 2, mastered: 4 },
    };
    expect(masteryLevelFor(1, false, policy.thresholds)).toBe("developing");
    expect(masteryLevelFor(3, true, policy.thresholds)).toBe("proficient");
    expect(masteryLevelFor(4, true, policy.thresholds)).toBe("mastered");
  });
});

describe("decideSkillAction", () => {
  it("revisits on failure, continues on partial", () => {
    expect(decideSkillAction("failure", "learning")).toBe("revisit");
    expect(decideSkillAction("partial", "learning")).toBe("continue");
  });

  it("advances only once the success reaches the advance threshold", () => {
    expect(decideSkillAction("success", "developing")).toBe("continue");
    expect(decideSkillAction("success", "proficient")).toBe("advance");
    expect(decideSkillAction("success", "mastered")).toBe("advance");
  });

  it("is configurable", () => {
    const policy: SkillUpdatePolicy = {
      ...DEFAULT_SKILL_UPDATE_POLICY,
      advanceMinMastery: "mastered",
    };
    expect(decideSkillAction("success", "proficient", policy)).toBe("continue");
    expect(decideSkillAction("success", "mastered", policy)).toBe("advance");
  });
});

describe("nextTopicId", () => {
  it("walks the curriculum order and stops at the end", () => {
    expect(nextTopicId(curriculum, TOPIC_A)).toBe(TOPIC_B);
    expect(nextTopicId(curriculum, TOPIC_C)).toBeNull();
    expect(nextTopicId(curriculum, asTopicId("topic_unknown"))).toBeNull();
  });
});

describe("planSkillUpdate", () => {
  it("creates the first skill state from a success", () => {
    const planned = must(
      planSkillUpdate({
        userId: USER,
        topicId: TOPIC_A,
        curriculum,
        evaluation: evaluation({ score: 80, topicId: TOPIC_A }),
        skillState: null,
        progress: null,
        now: NOW,
      }),
    );
    expect(planned).not.toBeNull();
    expect(planned).toMatchObject({
      outcome: "success",
      decision: "continue",
      previousMasteryLevel: "not_started",
      masteryLevel: "learning",
      successfulAttempts: 1,
      totalAttempts: 1,
      currentTopicId: TOPIC_A,
      advanced: false,
    });
    expect(planned?.skillState.lastOutcome).toBe("success");
    expect(planned?.skillState.lastEvaluationId).toBeDefined();
    expect(planned?.skillState.createdAt).toBe(NOW);
  });

  it("masters and advances after enough strong successes", () => {
    const prior = must(
      createUserSkillState({
        userId: USER,
        curriculumId: CURRICULUM_ID,
        topicId: TOPIC_A,
        masteryLevel: "developing",
        successfulAttempts: 2,
        totalAttempts: 2,
        now: new Date("2026-09-14T10:00:00.000Z"),
      }),
    );
    const progress = must(
      createUserCurriculumProgress({
        userId: USER,
        curriculumId: CURRICULUM_ID,
        currentTopicId: TOPIC_A,
        completedTopicIds: [],
        now: new Date("2026-09-14T10:00:00.000Z"),
      }),
    );
    const planned = must(
      planSkillUpdate({
        userId: USER,
        topicId: TOPIC_A,
        curriculum,
        evaluation: evaluation({ score: 95, topicId: TOPIC_A }),
        skillState: prior,
        progress,
        now: NOW,
      }),
    );
    expect(planned).toMatchObject({
      outcome: "success",
      decision: "advance",
      masteryLevel: "mastered",
      successfulAttempts: 3,
      totalAttempts: 3,
      currentTopicId: TOPIC_B,
      advanced: true,
      completedTopicIds: [TOPIC_A],
    });
    expect(planned?.skillState.createdAt).toEqual(prior.createdAt);
    expect(planned?.progress.createdAt).toEqual(progress.createdAt);
  });

  it("revisits the topic on failure without demoting mastery", () => {
    const prior = must(
      createUserSkillState({
        userId: USER,
        curriculumId: CURRICULUM_ID,
        topicId: TOPIC_A,
        masteryLevel: "developing",
        successfulAttempts: 2,
        totalAttempts: 2,
        now: new Date("2026-09-14T10:00:00.000Z"),
      }),
    );
    const planned = must(
      planSkillUpdate({
        userId: USER,
        topicId: TOPIC_A,
        curriculum,
        evaluation: evaluation({ score: 10, topicId: TOPIC_A }),
        skillState: prior,
        progress: null,
        now: NOW,
      }),
    );
    expect(planned).toMatchObject({
      outcome: "failure",
      decision: "revisit",
      masteryLevel: "developing",
      successfulAttempts: 2,
      totalAttempts: 3,
      currentTopicId: TOPIC_A,
      advanced: false,
    });
  });

  it("skips when the same evaluation was already applied", () => {
    const eval1 = evaluation({ score: 80, topicId: TOPIC_A });
    const first = must(
      planSkillUpdate({
        userId: USER,
        topicId: TOPIC_A,
        curriculum,
        evaluation: eval1,
        skillState: null,
        progress: null,
        now: NOW,
      }),
    );
    const replay = must(
      planSkillUpdate({
        userId: USER,
        topicId: TOPIC_A,
        curriculum,
        evaluation: eval1,
        skillState: first!.skillState,
        progress: first!.progress,
        now: NOW,
      }),
    );
    expect(replay).toBeNull();
  });

  it("is deterministic for identical inputs", () => {
    const eval1 = evaluation({ score: 60, topicId: TOPIC_A, weaknesses: ["complexity"] });
    const planA = must(
      planSkillUpdate({
        userId: USER,
        topicId: TOPIC_A,
        curriculum,
        evaluation: eval1,
        skillState: null,
        progress: null,
        now: NOW,
      }),
    );
    const planB = must(
      planSkillUpdate({
        userId: USER,
        topicId: TOPIC_A,
        curriculum,
        evaluation: eval1,
        skillState: null,
        progress: null,
        now: NOW,
      }),
    );
    expect(planA).toEqual(planB);
  });

  it("merges, dedupes and caps notes", () => {
    const prior = must(
      createUserSkillState({
        userId: USER,
        curriculumId: CURRICULUM_ID,
        topicId: TOPIC_A,
        strengths: ["two pointers"],
        weaknesses: ["complexity"],
        now: NOW,
      }),
    );
    const longNote = "x".repeat(500);
    const planned = must(
      planSkillUpdate({
        userId: USER,
        topicId: TOPIC_A,
        curriculum,
        evaluation: evaluation({
          score: 80,
          topicId: TOPIC_A,
          strengths: ["two pointers", "sliding window"],
          weaknesses: [longNote],
        }),
        skillState: prior,
        progress: null,
        now: NOW,
      }),
    );
    expect(planned?.skillState.strengths).toEqual(["two pointers", "sliding window"]);
    expect(planned?.skillState.weaknesses).toEqual(["complexity", "x".repeat(200)]);
  });
});
