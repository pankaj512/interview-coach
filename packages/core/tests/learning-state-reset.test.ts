// Reset learning state: InMemory deleteByUser removes only the caller's rows
// across skill states, curriculum progress, and recommendations.

import { describe, expect, it } from "vitest";
import {
  asCurriculumId,
  asProblemId,
  asTopicId,
  asUserId,
  createInMemoryRepositories,
  createRecommendation,
  createUserCurriculumProgress,
  createUserSkillState,
} from "../src/index.js";
import { must } from "./helpers.js";

const CURRICULUM_ID = asCurriculumId("dsa");
const USER = asUserId("user_reset");
const OTHER = asUserId("user_other");
const T1 = asTopicId("topic_arrays");
const T2 = asTopicId("topic_strings");

function skill(userId: typeof USER, topicId: typeof T1) {
  return must(createUserSkillState({ userId, curriculumId: CURRICULUM_ID, topicId }));
}

function progress(userId: typeof USER) {
  return must(createUserCurriculumProgress({ userId, curriculumId: CURRICULUM_ID }));
}

function recommendation(userId: typeof USER) {
  return must(
    createRecommendation({
      userId,
      curriculumId: CURRICULUM_ID,
      recommendationType: "new_topic",
      topicId: T1,
      problemId: asProblemId("prob_a1"),
      reason: "Start here",
      source: "fallback",
    }),
  );
}

describe("learning-state reset repositories", () => {
  it("deletes only the caller's skill states and returns the count", async () => {
    const repos = createInMemoryRepositories();
    await repos.skillStates.save(skill(USER, T1));
    await repos.skillStates.save(skill(USER, T2));
    await repos.skillStates.save(skill(OTHER, T1));
    expect(await repos.skillStates.deleteByUser(USER)).toBe(2);
    expect(await repos.skillStates.findByUser(USER)).toEqual([]);
    expect(await repos.skillStates.findByUser(OTHER)).toHaveLength(1);
    expect(await repos.skillStates.deleteByUser(USER)).toBe(0);
  });

  it("deletes only the caller's curriculum progress and returns the count", async () => {
    const repos = createInMemoryRepositories();
    await repos.curriculumProgress.save(progress(USER));
    await repos.curriculumProgress.save(progress(OTHER));
    expect(await repos.curriculumProgress.deleteByUser(USER)).toBe(1);
    expect(await repos.curriculumProgress.findByUser(USER, CURRICULUM_ID)).toBeNull();
    expect(await repos.curriculumProgress.findByUser(OTHER, CURRICULUM_ID)).not.toBeNull();
  });

  it("deletes only the caller's recommendations and returns the count", async () => {
    const repos = createInMemoryRepositories();
    await repos.recommendations.save(recommendation(USER));
    await repos.recommendations.save(recommendation(USER));
    await repos.recommendations.save(recommendation(OTHER));
    expect(await repos.recommendations.deleteByUser(USER)).toBe(2);
    expect(await repos.recommendations.findCurrentByUser(USER)).toBeNull();
    expect(await repos.recommendations.listByUser(USER)).toEqual([]);
    expect(await repos.recommendations.listByUser(OTHER)).toHaveLength(1);
  });
});
