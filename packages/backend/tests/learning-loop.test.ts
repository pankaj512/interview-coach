// Phase 12: the adaptive learning loop. A completed interview is evaluated,
// the skill state updates, and the current recommendation is superseded +
// regenerated from the new state — deterministically and without oscillation.

import { afterEach, describe, expect, it } from "vitest";
import {
  DSA_CURRICULUM_ID,
  asTopicId,
  asUserId,
  nextTopicId,
  type EvaluationModel,
  type EvaluationModelInput,
  type EvaluationModelResult,
  type RecommendationModel,
  type RecommendationModelInput,
  type RecommendationModelResult,
} from "@interview-coach/domain";
import { buildTestBackend, seedCurriculum, type TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

const TOPIC = asTopicId("topic_arrays");

class FakeRecommendationModel implements RecommendationModel {
  readonly name = "fake-recommendation";
  async recommend(input: RecommendationModelInput): Promise<RecommendationModelResult> {
    const candidate = input.candidateSet.candidates[0];
    if (candidate === undefined) return { proposal: null };
    return {
      proposal: {
        recommendationType: candidate.recommendationType,
        topicId: candidate.topicId,
        problemId: candidate.problemId,
        reason: "Fake model picks the top candidate.",
      },
    };
  }
}

class ScoreEvaluationModel implements EvaluationModel {
  readonly name = "score";
  constructor(private readonly score: number) {}
  async evaluate(_input: EvaluationModelInput): Promise<EvaluationModelResult> {
    return {
      proposal: {
        dimensions: {
          understanding: { score: this.score },
          approach: { score: this.score },
          coding: { score: this.score },
          independence: { score: this.score },
        },
        strengths: [],
        weaknesses: [],
      },
    };
  }
}

async function register(tb: TestBackend, email: string): Promise<string> {
  const res = await tb.app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, displayName: "Loop", password: "correct-horse-123" },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { session: { token: string } }).session.token;
}

async function generateRecommendation(
  tb: TestBackend,
  auth: Record<string, string>,
): Promise<{ id: string; userId: string; topicId: string; problemId: string }> {
  const res = await tb.app.inject({ method: "POST", url: "/api/recommendations", headers: auth });
  expect(res.statusCode).toBe(201);
  return (res.json() as { recommendation: { id: string; userId: string; topicId: string; problemId: string } })
    .recommendation;
}

async function acceptRecommendation(
  tb: TestBackend,
  auth: Record<string, string>,
  id: string,
): Promise<void> {
  const res = await tb.app.inject({
    method: "POST",
    url: `/api/recommendations/${id}/accept`,
    headers: auth,
  });
  expect(res.statusCode).toBe(200);
}

async function runInterview(
  tb: TestBackend,
  auth: Record<string, string>,
  binding: { recommendationId?: string; topicId?: string },
): Promise<void> {
  const created = await tb.app.inject({
    method: "POST",
    url: "/api/interviews",
    headers: auth,
    payload: {
      candidateId: "ignored",
      configuration: { interviewType: "dsa" },
      ...(binding.recommendationId === undefined
        ? { topicId: binding.topicId }
        : { recommendationId: binding.recommendationId }),
    },
  });
  expect(created.statusCode).toBe(201);
  const id = (created.json() as { interview: { id: string } }).interview.id;
  const assigned = await tb.app.inject({
    method: "POST",
    url: `/api/interviews/${id}/problems`,
    headers: auth,
    payload: { problemIds: ["prob_move-zeroes"] },
  });
  expect(assigned.statusCode).toBe(200);
  await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/ready`, headers: auth });
  await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/start`, headers: auth });
  const ended = await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end`, headers: auth });
  expect(ended.statusCode).toBe(200);
}

async function currentRecommendation(
  tb: TestBackend,
  auth: Record<string, string>,
): Promise<{ id: string; status: string; topicId: string; problemId: string }> {
  const res = await tb.app.inject({ method: "GET", url: "/api/recommendations/current", headers: auth });
  expect(res.statusCode).toBe(200);
  return (res.json() as { recommendation: { id: string; status: string; topicId: string; problemId: string } })
    .recommendation;
}

function loopBackend(evaluationScore: number): TestBackend {
  return buildTestBackend({
    recommendationModel: new FakeRecommendationModel(),
    evaluationModel: new ScoreEvaluationModel(evaluationScore),
  });
}

describe("phase 12 adaptive learning loop", () => {
  it("supersedes the current recommendation and regenerates after an evaluation", async () => {
    backend = loopBackend(5);
    const tb = backend;
    await seedCurriculum(tb.repos);
    const auth = { authorization: `Bearer ${await register(tb, "loop@example.com")}` };

    const initial = await generateRecommendation(tb, auth);
    await acceptRecommendation(tb, auth, initial.id);
    await runInterview(tb, auth, { recommendationId: initial.id });

    const current = await currentRecommendation(tb, auth);
    expect(current.id).not.toBe(initial.id);
    expect(current.status).toBe("active");

    const all = await tb.repos.recommendations.listByUser(asUserId(initial.userId));
    const byId = new Map(all.map((r) => [r.id as string, r.status]));
    expect(byId.get(initial.id)).toBe("superseded");
    expect(byId.get(current.id)).toBe("active");
  });

  it("advances the recommendation to the next topic after mastering one", async () => {
    backend = loopBackend(5);
    const tb = backend;
    await seedCurriculum(tb.repos);
    const auth = { authorization: `Bearer ${await register(tb, "advance@example.com")}` };

    const initial = await generateRecommendation(tb, auth);
    expect(initial.topicId).toBe(TOPIC);
    await acceptRecommendation(tb, auth, initial.id);

    await runInterview(tb, auth, { recommendationId: initial.id });
    await runInterview(tb, auth, { topicId: TOPIC });
    await runInterview(tb, auth, { topicId: TOPIC });

    const curriculum = await tb.repos.curricula.findById(DSA_CURRICULUM_ID);
    expect(curriculum).not.toBeNull();
    const expectedNext = nextTopicId(curriculum!, TOPIC);
    const current = await currentRecommendation(tb, auth);
    expect(current.topicId).toBe(expectedNext);
  });

  it("stays on the topic after a failure (no oscillation)", async () => {
    backend = loopBackend(0);
    const tb = backend;
    await seedCurriculum(tb.repos);
    const auth = { authorization: `Bearer ${await register(tb, "oscillate@example.com")}` };

    const initial = await generateRecommendation(tb, auth);
    await acceptRecommendation(tb, auth, initial.id);
    await runInterview(tb, auth, { recommendationId: initial.id });
    const first = await currentRecommendation(tb, auth);
    expect(first.topicId).toBe(TOPIC);

    await runInterview(tb, auth, { topicId: TOPIC });
    const second = await currentRecommendation(tb, auth);
    expect(second.topicId).toBe(TOPIC);
    // A failure does not increment successful attempts, so the same problem is
    // re-recommended rather than skipping ahead.
    expect(second.problemId).toBe(first.problemId);
  });

  it("counts loop regenerations without failing the evaluation", async () => {
    backend = loopBackend(5);
    const tb = backend;
    await seedCurriculum(tb.repos);
    const auth = { authorization: `Bearer ${await register(tb, "loop-metrics@example.com")}` };

    const initial = await generateRecommendation(tb, auth);
    await runInterview(tb, auth, { recommendationId: initial.id });
    await runInterview(tb, auth, { topicId: TOPIC });

    const metrics = await tb.app.inject({ method: "GET", url: "/api/metrics" });
    expect(metrics.json()).toMatchObject({
      ok: true,
      metrics: {
        recommendationsRegenerated: 2,
        recommendationRegenerationFailures: 0,
      },
    });
  });
});
