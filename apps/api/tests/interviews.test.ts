// S3 interview lifecycle routes: create/get/state/ready/start/pause/resume/
// cancel/fail/end, problem assignment, problem fetch, health.

import { afterEach, describe, expect, it } from "vitest";
import { buildTestBackend, createStartedInterview, seedProblem } from "./helpers.js";
import type { TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

function useBackend(): TestBackend {
  backend = buildTestBackend();
  return backend;
}

describe("health", () => {
  it("returns ok with service identity", async () => {
    const b = useBackend();
    const res = await b.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, service: "interview-coach-backend" });
  });
});

describe("interview lifecycle", () => {
  it("create -> ready -> start -> state advances status", async () => {
    const b = useBackend();
    const created = await b.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { interview: { id: string } }).interview.id;

    for (const [url, status] of [
      [`/api/interviews/${id}/ready`, "ready"],
      [`/api/interviews/${id}/start`, "in_progress"],
    ] as const) {
      const res = await b.app.inject({ method: "POST", url });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { interview: { status: string } }).interview.status).toBe(status);
    }

    const state = await b.app.inject({ method: "GET", url: `/api/interviews/${id}/state` });
    expect(state.statusCode).toBe(200);
    expect((state.json() as { state: { interview: { status: string } } }).state.interview.status).toBe(
      "in_progress",
    );
  });

  it("rejects invalid configuration with 400 VALIDATION_ERROR", async () => {
    const b = useBackend();
    const res = await b.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: {
        candidateId: "user_1",
        configuration: { interviewType: "dsa", durationMinutes: -5 },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", retryable: false },
    });
  });

  it("maps malformed request bodies to a 400 envelope (never 500)", async () => {
    const b = useBackend();
    const res = await b.app.inject({
      method: "POST",
      url: "/api/interviews/iv_missing/ready",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, error: { retryable: false } });
  });

  it("returns 404 for unknown interviews", async () => {
    const b = useBackend();
    const res = await b.app.inject({ method: "GET", url: "/api/interviews/iv_missing" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("end finalizes in_progress -> completed and is idempotent", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const first = await b.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      ok: true,
      interview: { status: "completed" },
      transitioned: true,
    });
    const second = await b.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      interview: { status: "completed" },
      transitioned: false,
    });
  });

  it("end rejects interviews that never started", async () => {
    const b = useBackend();
    const created = await b.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    const res = await b.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ ok: false, error: { code: "ILLEGAL_TRANSITION" } });
  });

  it("pause -> resume round-trips through in_progress", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const paused = await b.app.inject({ method: "POST", url: `/api/interviews/${id}/pause` });
    expect(paused.statusCode).toBe(200);
    expect(paused.json()).toMatchObject({ ok: true, interview: { status: "paused" } });
    const resumed = await b.app.inject({ method: "POST", url: `/api/interviews/${id}/resume` });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toMatchObject({ ok: true, interview: { status: "in_progress" } });
  });

  it("pause rejects interviews that never started", async () => {
    const b = useBackend();
    const created = await b.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    const res = await b.app.inject({ method: "POST", url: `/api/interviews/${id}/pause` });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ ok: false, error: { code: "ILLEGAL_TRANSITION" } });
  });

  it("cancel moves a created interview to cancelled with an optional reason", async () => {
    const b = useBackend();
    const created = await b.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/cancel`,
      payload: { reason: "candidate withdrew" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, interview: { status: "cancelled" } });
  });

  it("fail moves a running interview to failed without requiring a body", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const res = await b.app.inject({ method: "POST", url: `/api/interviews/${id}/fail` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, interview: { status: "failed" } });
  });

  it("cancel rejects malformed reasons with 400", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/cancel`,
      payload: { reason: 42 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});

describe("problems", () => {
  it("assigns seeded problems and fetches them back", async () => {
    const b = useBackend();
    await seedProblem(b.repos);
    const created = await b.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    const assigned = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/problems`,
      payload: { problemIds: ["prob_two-sum"] },
    });
    expect(assigned.statusCode).toBe(200);
    expect((assigned.json() as { interview: { currentOrder: number } }).interview.currentOrder).toBe(0);

    const fetched = await b.app.inject({ method: "GET", url: "/api/problems/prob_two-sum" });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({ ok: true, problem: { title: "Two Sum" } });

    const missing = await b.app.inject({ method: "GET", url: "/api/problems/prob_nope" });
    expect(missing.statusCode).toBe(404);
  });

  it("assign rejects unknown problem ids with 404", async () => {
    const b = useBackend();
    const created = await b.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/problems`,
      payload: { problemIds: ["prob_nope"] },
    });
    expect(res.statusCode).toBe(404);
  });
});
