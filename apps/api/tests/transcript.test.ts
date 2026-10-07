// Phase 9: server-backed transcript + history listing + interview linkage.
// In-memory repos; no DB needed.

import { afterEach, describe, expect, it } from "vitest";
import { buildTestBackend, seedCurriculum, seedDataAvailable, type TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

interface SessionBody {
  user: { id: string };
  session: { token: string };
}

async function register(tb: TestBackend, email: string): Promise<{ token: string; userId: string }> {
  const res = await tb.app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, displayName: "Phase 9", password: "correct-horse-123" },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as SessionBody;
  return { token: body.session.token, userId: body.user.id };
}

const PROFILE = {
  interviewTypes: ["dsa"],
  role: "backend_engineer",
  level: "senior",
  goals: "Sharpen arrays",
};

async function createOwnedInterview(
  tb: TestBackend,
  token: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await tb.app.inject({
    method: "POST",
    url: "/api/interviews",
    headers: { authorization: `Bearer ${token}` },
    payload: { candidateId: "ignored", configuration: { interviewType: "dsa" }, ...extra },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { interview: { id: string } }).interview.id;
}

describe("phase 9 transcript", () => {
  it("appends and reads back structured transcript in order", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const { token } = await register(tb, "t9@example.com");
    const auth = { authorization: `Bearer ${token}` };
    const id = await createOwnedInterview(tb, token);

    const appended = await tb.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/transcript`,
      headers: auth,
      payload: {
        messages: [
          { role: "interviewer", content: "Welcome, let's begin." },
          { role: "candidate", content: "Thanks, ready." },
        ],
      },
    });
    expect(appended.statusCode).toBe(201);
    expect((appended.json() as { messages: unknown[] }).messages).toHaveLength(2);

    const read = await tb.app.inject({
      method: "GET",
      url: `/api/interviews/${id}/transcript`,
      headers: auth,
    });
    expect(read.statusCode).toBe(200);
    const messages = (read.json() as { messages: { role: string; content: string }[] }).messages;
    expect(messages.map((m) => m.role)).toEqual(["interviewer", "candidate"]);
    expect(messages.map((m) => m.content)).toEqual([
      "Welcome, let's begin.",
      "Thanks, ready.",
    ]);
  });

  it("rejects an empty or malformed transcript batch", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const { token } = await register(tb, "t9b@example.com");
    const auth = { authorization: `Bearer ${token}` };
    const id = await createOwnedInterview(tb, token);
    const empty = await tb.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/transcript`,
      headers: auth,
      payload: { messages: [] },
    });
    expect(empty.statusCode).toBe(400);
    const badRole = await tb.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/transcript`,
      headers: auth,
      payload: { messages: [{ role: "robot", content: "hi" }] },
    });
    expect(badRole.statusCode).toBe(400);
  });

  it("scopes transcript access to the interview owner", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const owner = await register(tb, "owner9@example.com");
    const stranger = await register(tb, "stranger9@example.com");
    const id = await createOwnedInterview(tb, owner.token);
    const denied = await tb.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/transcript`,
      headers: { authorization: `Bearer ${stranger.token}` },
      payload: { messages: [{ role: "candidate", content: "hi" }] },
    });
    expect(denied.statusCode).toBe(404);
  });
});

describe("phase 9 history listing", () => {
  it("lists the caller's interviews newest-first with their evaluation", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const { token } = await register(tb, "h9@example.com");
    const auth = { authorization: `Bearer ${token}` };
    const first = await createOwnedInterview(tb, token);
    const second = await createOwnedInterview(tb, token);

    const listed = await tb.app.inject({ method: "GET", url: "/api/interviews", headers: auth });
    expect(listed.statusCode).toBe(200);
    const rows = (listed.json() as { interviews: { interview: { id: string }; evaluation: unknown }[] }).interviews;
    expect(rows.map((r) => r.interview.id)).toEqual([second, first]);
    expect(rows.every((r) => r.evaluation === null)).toBe(true);
  });

  it("never lists another user's interviews", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const a = await register(tb, "a9@example.com");
    const b = await register(tb, "b9@example.com");
    await createOwnedInterview(tb, a.token);
    const listed = await tb.app.inject({
      method: "GET",
      url: "/api/interviews",
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect((listed.json() as { interviews: unknown[] }).interviews).toHaveLength(0);
  });
});

describe.skipIf(!seedDataAvailable())("phase 9 interview linkage", () => {
  it("binds recommendation + topic on create and rejects a foreign recommendation", async () => {
    backend = buildTestBackend();
    const tb = backend;
    await seedCurriculum(tb.repos);
    const owner = await register(tb, "link9@example.com");
    const stranger = await register(tb, "link9b@example.com");
    const auth = { authorization: `Bearer ${owner.token}` };
    await tb.app.inject({ method: "PUT", url: "/api/profile", headers: auth, payload: PROFILE });
    const generated = await tb.app.inject({ method: "POST", url: "/api/recommendations", headers: auth });
    const recommendation = (generated.json() as {
      recommendation: { id: string; topicId: string };
    }).recommendation;

    const created = await tb.app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: auth,
      payload: {
        candidateId: "ignored",
        configuration: { interviewType: "dsa" },
        recommendationId: recommendation.id,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      interview: { recommendationId: recommendation.id, topicId: recommendation.topicId, evaluationStatus: "none" },
    });

    const foreign = await tb.app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: { authorization: `Bearer ${stranger.token}` },
      payload: {
        candidateId: "ignored",
        configuration: { interviewType: "dsa" },
        recommendationId: recommendation.id,
      },
    });
    expect(foreign.statusCode).toBe(404);
  });
});
