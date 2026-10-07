// Phase 3 skill state: mastery scale config + skill/progress validation.
import { describe, expect, it } from "vitest";
import { asCurriculumId, asTopicId, asUserId } from "../src/ids.js";
import {
  MASTERY_LEVELS,
  MASTERY_LEVEL_LABELS,
  MASTERY_THRESHOLDS,
  createUserCurriculumProgress,
  createUserSkillState,
  isMasteryLevel,
  isSkillOutcome,
} from "../src/skill.js";
import { must, mustErr } from "./helpers.js";

const USER = asUserId("user_1");
const CURRICULUM = asCurriculumId("dsa");
const TOPIC = asTopicId("topic_arrays");
const NOW = new Date("2026-09-14T10:00:00.000Z");

describe("mastery scale", () => {
  it("exposes the locked scale, labels and thresholds", () => {
    expect(MASTERY_LEVELS).toEqual([
      "not_started",
      "learning",
      "developing",
      "proficient",
      "mastered",
    ]);
    for (const level of MASTERY_LEVELS) {
      expect(MASTERY_LEVEL_LABELS[level]).toBeTruthy();
      expect(isMasteryLevel(level)).toBe(true);
    }
    expect(isMasteryLevel("expert")).toBe(false);
    expect(MASTERY_THRESHOLDS).toEqual({
      learning: 1,
      developing: 2,
      proficient: 3,
      mastered: 3,
    });
    expect(isSkillOutcome("success")).toBe(true);
    expect(isSkillOutcome("maybe")).toBe(false);
  });
});

describe("createUserSkillState", () => {
  it("defaults to not_started with empty counters", () => {
    const state = must(createUserSkillState({ userId: USER, curriculumId: CURRICULUM, topicId: TOPIC, now: NOW }));
    expect(state.masteryLevel).toBe("not_started");
    expect(state.successfulAttempts).toBe(0);
    expect(state.totalAttempts).toBe(0);
    expect(state.strengths).toEqual([]);
    expect(state.weaknesses).toEqual([]);
    expect(state.createdAt).toBe(NOW);
  });

  it("trims, dedups and caps notes", () => {
    const state = must(
      createUserSkillState({
        userId: USER,
        curriculumId: CURRICULUM,
        topicId: TOPIC,
        masteryLevel: "developing",
        successfulAttempts: 2,
        totalAttempts: 3,
        lastOutcome: "success",
        strengths: ["  two pointers ", "two pointers", "edge cases"],
        weaknesses: ["complexity"],
        now: NOW,
      }),
    );
    expect(state.strengths).toEqual(["two pointers", "edge cases"]);
    expect(state.weaknesses).toEqual(["complexity"]);
  });

  it("rejects invalid levels, counters and outcomes", () => {
    expect(
      mustErr(
        createUserSkillState({
          userId: USER,
          curriculumId: CURRICULUM,
          topicId: TOPIC,
          masteryLevel: "expert" as never,
        }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        createUserSkillState({
          userId: USER,
          curriculumId: CURRICULUM,
          topicId: TOPIC,
          successfulAttempts: 3,
          totalAttempts: 2,
        }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        createUserSkillState({
          userId: USER,
          curriculumId: CURRICULUM,
          topicId: TOPIC,
          lastOutcome: "maybe" as never,
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("createUserCurriculumProgress", () => {
  it("dedupes completed topics and keeps the pointer", () => {
    const progress = must(
      createUserCurriculumProgress({
        userId: USER,
        curriculumId: CURRICULUM,
        currentTopicId: TOPIC,
        completedTopicIds: ["topic_arrays", "topic_arrays", "topic_strings"],
        now: NOW,
      }),
    );
    expect(progress.currentTopicId).toBe(TOPIC);
    expect(progress.completedTopicIds).toEqual(["topic_arrays", "topic_strings"]);
  });

  it("rejects non-string completed topics", () => {
    expect(
      mustErr(
        createUserCurriculumProgress({
          userId: USER,
          curriculumId: CURRICULUM,
          completedTopicIds: [42],
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});
