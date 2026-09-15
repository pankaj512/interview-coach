// Phase 11: applying an accepted evaluation to UserSkillState + curriculum
// progress. The async evaluation job invokes SkillUpdateService; the update is
// deterministic and idempotent per evaluation.

import { afterEach, describe, expect, it } from "vitest";
import {
  asCurriculumId,
  asTopicId,
  asUserId,
  nextTopicId,
  type EvaluationModel,
  type EvaluationModelInput,
  type EvaluationModelResult,
} from "@interview-coach/domain";
import { buildTestBackend, seedCurriculum, type TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

const USER = asUserId("user_test");
const CURRICULUM = asCurriculumId("dsa");
const TOPIC = asTopicId("topic_arrays");

class HighScoreModel implements EvaluationModel {
  readonly name = "high-score";
  async evaluate(_input: EvaluationModelInput): Promise<EvaluationModelResult> {
    return {
      proposal: {
        dimensions: {
          problem_understanding: { score: 5 },
          approach: { score: 5 },
          coding: { score: 5 },
          independence: { score: 5 },
        },
        strengths: ["Clear and correct"],
        weaknesses: [],
      },
    };
  }
}

async function startInterview(tb: TestBackend, topicId?: string): Promise<string> {
  const created = await tb.app.inject({
    method: "POST",
    url: "/api/interviews",
    payload: {
      candidateId: USER,
      configuration: { interviewType: "dsa" },
      ...(topicId === undefined ? {} : { topicId }),
    },
  });
  expect(created.statusCode).toBe(201);
  const id = (created.json() as { interview: { id: string } }).interview.id;
  const assigned = await tb.app.inject({
    method: "POST",
    url: `/api/interviews/${id}/problems`,
    payload: { problemIds: ["prob_move-zeroes"] },
  });
  expect(assigned.statusCode).toBe(200);
  await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
  await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/start` });
  return id;
}

async function endInterview(tb: TestBackend, id: string): Promise<void> {
  const res = await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
  expect(res.statusCode).toBe(200);
}

async function skillOf(tb: TestBackend, topicId = TOPIC) {
  return tb.repos.skillStates.findByTopic(USER, CURRICULUM, topicId);
}

describe("phase 11 skill update", () => {
  it("applies the fallback evaluation to skill state and progress", async () => {
    backend = buildTestBackend();
    const tb = backend;
    await seedCurriculum(tb.repos);
    const id = await startInterview(tb, TOPIC);
    await endInterview(tb, id);

    const skill = await skillOf(tb);
    expect(skill).not.toBeNull();
    // No responses -> fallback: understanding 1, communication 2,
    // independence 5 -> mean 2.67 -> 53 -> partial (lean_no_hire).
    expect(skill).toMatchObject({
      masteryLevel: "not_started",
      successfulAttempts: 0,
      totalAttempts: 1,
      lastOutcome: "partial",
    });
    expect(skill?.lastEvaluationId).toBeDefined();

    const progress = await tb.repos.curriculumProgress.findByUser(USER, CURRICULUM);
    expect(progress?.currentTopicId).toBe(TOPIC);
    expect(progress?.completedTopicIds).toEqual([]);
  });

  it("masters and advances the curriculum after three strong successes", async () => {
    backend = buildTestBackend({ evaluationModel: new HighScoreModel() });
    const tb = backend;
    await seedCurriculum(tb.repos);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = await startInterview(tb, TOPIC);
      await endInterview(tb, id);
    }

    const skill = await skillOf(tb);
    expect(skill).toMatchObject({
      masteryLevel: "mastered",
      successfulAttempts: 3,
      totalAttempts: 3,
      lastOutcome: "success",
    });

    const curriculum = await tb.repos.curricula.findById(CURRICULUM);
    expect(curriculum).not.toBeNull();
    const expectedNext = nextTopicId(curriculum!, TOPIC);
    const progress = await tb.repos.curriculumProgress.findByUser(USER, CURRICULUM);
    expect(progress?.completedTopicIds).toEqual([TOPIC]);
    expect(progress?.currentTopicId).toBe(expectedNext);
  });

  it("does not double-count when the interview is ended twice", async () => {
    backend = buildTestBackend({ evaluationModel: new HighScoreModel() });
    const tb = backend;
    await seedCurriculum(tb.repos);
    const id = await startInterview(tb, TOPIC);
    await endInterview(tb, id);
    await endInterview(tb, id);

    const skill = await skillOf(tb);
    expect(skill).toMatchObject({ successfulAttempts: 1, totalAttempts: 1 });
  });

  it("skips the update when the evaluation has no topic", async () => {
    backend = buildTestBackend({ evaluationModel: new HighScoreModel() });
    const tb = backend;
    await seedCurriculum(tb.repos);
    const id = await startInterview(tb);
    await endInterview(tb, id);

    const skills = await tb.repos.skillStates.findByUser(USER, CURRICULUM);
    expect(skills).toEqual([]);
  });
});
