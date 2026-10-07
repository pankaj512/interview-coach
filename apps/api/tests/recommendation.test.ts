// Phase 4 recommendation routes: user-scoped generation + accept, LLM
// validation, deterministic fallback, supersession, ownership, metrics.
// In-memory repos + a fake model; no DB and no live LLM.

import { afterEach, describe, expect, it } from "vitest";
import type {
  RecommendationModel,
  RecommendationModelInput,
  RecommendationModelResult,
} from "@interview-coach/core";
import { asUserId } from "@interview-coach/core";
import { buildTestBackend, seedCurriculum, seedDataAvailable, type TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

class FakeRecommendationModel implements RecommendationModel {
  readonly name = "fake";
  lastInput: RecommendationModelInput | null = null;
  calls = 0;
  constructor(
    private readonly behavior: (input: RecommendationModelInput) => RecommendationModelResult,
  ) {}

  async recommend(input: RecommendationModelInput): Promise<RecommendationModelResult> {
    this.lastInput = input;
    this.calls += 1;
    return this.behavior(input);
  }
}

async function register(tb: TestBackend, email: string): Promise<string> {
  const res = await tb.app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, displayName: "Recommender", password: "correct-horse-123" },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { session: { token: string } }).session.token;
}

const firstCandidateProposal = (input: RecommendationModelInput) => {
  const candidate = input.candidateSet.candidates[0];
  if (candidate === undefined) throw new Error("no candidates");
  return {
    proposal: {
      recommendationType: candidate.recommendationType,
      topicId: candidate.topicId,
      problemId: candidate.problemId,
      reason: "Recommended by the fake model.",
    },
  };
};

describe.skipIf(!seedDataAvailable())("phase 4 recommendation routes", () => {
  it("generates from the LLM proposal, persists it, and returns current", async () => {
    const model = new FakeRecommendationModel(firstCandidateProposal);
    backend = buildTestBackend({ recommendationModel: model });
    const tb = backend;
    await seedCurriculum(tb.repos);
    const token = await register(tb, "rec@example.com");
    const auth = { authorization: `Bearer ${token}` };

    const before = await tb.app.inject({
      method: "GET",
      url: "/api/recommendations/current",
      headers: auth,
    });
    expect(before.statusCode).toBe(200);
    expect((before.json() as { recommendation: unknown }).recommendation).toBeNull();

    const generated = await tb.app.inject({
      method: "POST",
      url: "/api/recommendations",
      headers: auth,
    });
    expect(generated.statusCode).toBe(201);
    const body = generated.json() as {
      recommendation: Record<string, unknown>;
      source: string;
    };
    expect(body.source).toBe("llm");
    expect(body.recommendation).toMatchObject({
      status: "active",
      source: "llm",
      topicId: model.lastInput?.candidateSet.candidates[0]?.topicId,
      problemId: model.lastInput?.candidateSet.candidates[0]?.problemId,
    });

    const current = await tb.app.inject({
      method: "GET",
      url: "/api/recommendations/current",
      headers: auth,
    });
    expect((current.json() as { recommendation: { id: string } }).recommendation.id).toBe(
      body.recommendation["id"],
    );
  });

  it("falls back deterministically when the model output is invalid", async () => {
    const model = new FakeRecommendationModel(() => ({
      proposal: {
        recommendationType: "new_topic",
        topicId: "topic_invented",
        problemId: "prob_invented",
        reason: "hallucinated",
      },
    }));
    backend = buildTestBackend({ recommendationModel: model });
    const tb = backend;
    await seedCurriculum(tb.repos);
    const auth = { authorization: `Bearer ${await register(tb, "fb@example.com")}` };

    const generated = await tb.app.inject({
      method: "POST",
      url: "/api/recommendations",
      headers: auth,
    });
    expect(generated.statusCode).toBe(201);
    const body = generated.json() as {
      recommendation: { source: string; topicId: string; problemId: string };
      source: string;
    };
    expect(body.source).toBe("fallback");
    expect(body.recommendation.source).toBe("fallback");
    // The fallback is the real first curriculum topic, never the invented pair.
    expect(body.recommendation.topicId).not.toBe("topic_invented");
    expect(body.recommendation.problemId).not.toBe("prob_invented");
  });

  it("falls back when the model throws (unconfigured default included)", async () => {
    const throwing = new FakeRecommendationModel(() => {
      throw new Error("model down");
    });
    backend = buildTestBackend({ recommendationModel: throwing });
    const tb = backend;
    await seedCurriculum(tb.repos);
    const auth = { authorization: `Bearer ${await register(tb, "down@example.com")}` };
    const generated = await tb.app.inject({
      method: "POST",
      url: "/api/recommendations",
      headers: auth,
    });
    expect(generated.statusCode).toBe(201);
    expect((generated.json() as { source: string }).source).toBe("fallback");
  });

  it("supersedes the previous proposal on regeneration", async () => {
    const model = new FakeRecommendationModel(firstCandidateProposal);
    backend = buildTestBackend({ recommendationModel: model });
    const tb = backend;
    await seedCurriculum(tb.repos);
    const token = await register(tb, "super@example.com");
    const auth = { authorization: `Bearer ${token}` };

    const first = await tb.app.inject({ method: "POST", url: "/api/recommendations", headers: auth });
    const firstBody = first.json() as { recommendation: { id: string; userId: string } };
    const firstId = firstBody.recommendation.id;
    const second = await tb.app.inject({ method: "POST", url: "/api/recommendations", headers: auth });
    const secondId = (second.json() as { recommendation: { id: string } }).recommendation.id;
    expect(secondId).not.toBe(firstId);

    const current = await tb.app.inject({
      method: "GET",
      url: "/api/recommendations/current",
      headers: auth,
    });
    expect((current.json() as { recommendation: { id: string } }).recommendation.id).toBe(secondId);

    const all = await tb.repos.recommendations.listByUser(asUserId(firstBody.recommendation.userId));
    const byId = new Map(all.map((r) => [r.id as string, r.status]));
    expect(byId.get(firstId)).toBe("superseded");
    expect(byId.get(secondId)).toBe("active");
  });

  it("accepts a proposal and enforces ownership", async () => {
    const model = new FakeRecommendationModel(firstCandidateProposal);
    backend = buildTestBackend({ recommendationModel: model });
    const tb = backend;
    await seedCurriculum(tb.repos);
    const a = { authorization: `Bearer ${await register(tb, "owner@example.com")}` };
    const b = { authorization: `Bearer ${await register(tb, "intruder@example.com")}` };

    const generated = await tb.app.inject({ method: "POST", url: "/api/recommendations", headers: a });
    const id = (generated.json() as { recommendation: { id: string } }).recommendation.id;

    const foreign = await tb.app.inject({
      method: "POST",
      url: `/api/recommendations/${id}/accept`,
      headers: b,
    });
    expect(foreign.statusCode).toBe(404);

    const accepted = await tb.app.inject({
      method: "POST",
      url: `/api/recommendations/${id}/accept`,
      headers: a,
    });
    expect(accepted.statusCode).toBe(200);
    expect((accepted.json() as { recommendation: { status: string } }).recommendation.status).toBe(
      "accepted",
    );
  });

  it("requires a user session and counts metrics", async () => {
    backend = buildTestBackend({ recommendationModel: new FakeRecommendationModel(firstCandidateProposal) });
    const tb = backend;
    await seedCurriculum(tb.repos);
    expect((await tb.app.inject({ method: "GET", url: "/api/recommendations/current" })).statusCode).toBe(401);
    expect((await tb.app.inject({ method: "POST", url: "/api/recommendations" })).statusCode).toBe(401);

    const auth = { authorization: `Bearer ${await register(tb, "metric@example.com")}` };
    await tb.app.inject({ method: "POST", url: "/api/recommendations", headers: auth });
    const metrics = await tb.app.inject({ method: "GET", url: "/api/metrics" });
    expect(metrics.json()).toMatchObject({
      ok: true,
      metrics: { recommendationsGenerated: 1, recommendationFallbacks: 0 },
    });
  });
});
