// DELETE /api/learning-state - Settings "Reset learning state".
// Wipes the caller's recommendations, skill states, and curriculum progress
// without touching interviews, profile, or other users.

import { afterEach, describe, expect, it } from "vitest";
import {
  asCurriculumId,
  asProblemId,
  asTopicId,
  asUserId,
  createRecommendation,
  createUserCurriculumProgress,
  createUserSkillState,
  type UserId,
} from "@interview-coach/domain";
import { buildTestBackend, type TestBackend } from "./helpers.js";
import { must } from "../../domain/tests/helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

const CURRICULUM_ID = asCurriculumId("dsa");
const TOPIC = asTopicId("topic_arrays");

async function register(tb: TestBackend, email: string): Promise<{ token: string; userId: UserId }> {
  const res = await tb.app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "correct horse battery staple", displayName: "Reset" },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { session: { token: string }; user: { id: string } };
  return { token: body.session.token, userId: asUserId(body.user.id) };
}

async function seedLearningState(tb: TestBackend, userId: UserId): Promise<void> {
  await tb.repos.skillStates.save(
    must(createUserSkillState({ userId, curriculumId: CURRICULUM_ID, topicId: TOPIC })),
  );
  await tb.repos.curriculumProgress.save(
    must(createUserCurriculumProgress({ userId, curriculumId: CURRICULUM_ID })),
  );
  await tb.repos.recommendations.save(
    must(
      createRecommendation({
        userId,
        curriculumId: CURRICULUM_ID,
        recommendationType: "new_topic",
        topicId: TOPIC,
        problemId: asProblemId("prob_a1"),
        reason: "Start here",
        source: "fallback",
      }),
    ),
  );
}

describe("DELETE /api/learning-state", () => {
  it("deletes the caller's learning state and returns counts", async () => {
    backend = buildTestBackend({});
    const { token, userId } = await register(backend, "reset@example.com");
    await seedLearningState(backend, userId);
    const auth = { authorization: `Bearer ${token}` };

    const res = await backend.app.inject({
      method: "DELETE",
      url: "/api/learning-state",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      deleted: { recommendations: 1, skillStates: 1, curriculumProgress: 1 },
    });
    expect(await backend.repos.recommendations.listByUser(userId)).toEqual([]);
    expect(await backend.repos.skillStates.findByUser(userId)).toEqual([]);
    expect(await backend.repos.curriculumProgress.findByUser(userId, CURRICULUM_ID)).toBeNull();

    // Profile and interviews are untouched: the account still resolves.
    const profile = await backend.app.inject({
      method: "GET",
      url: "/api/profile",
      headers: auth,
    });
    expect(profile.statusCode).toBe(200);
  });

  it("returns zeros when there is nothing to reset", async () => {
    backend = buildTestBackend({});
    const { token } = await register(backend, "fresh@example.com");
    const res = await backend.app.inject({
      method: "DELETE",
      url: "/api/learning-state",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      deleted: { recommendations: 0, skillStates: 0, curriculumProgress: 0 },
    });
  });

  it("does not touch another user's learning state", async () => {
    backend = buildTestBackend({});
    const owner = await register(backend, "owner@example.com");
    const stranger = await register(backend, "stranger@example.com");
    await seedLearningState(backend, stranger.userId);

    const res = await backend.app.inject({
      method: "DELETE",
      url: "/api/learning-state",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    expect(await backend.repos.recommendations.listByUser(stranger.userId)).toHaveLength(1);
    expect(await backend.repos.skillStates.findByUser(stranger.userId)).toHaveLength(1);
  });

  it("rejects signed-out callers with 401", async () => {
    backend = buildTestBackend({});
    const res = await backend.app.inject({ method: "DELETE", url: "/api/learning-state" });
    expect(res.statusCode).toBe(401);
  });
});
