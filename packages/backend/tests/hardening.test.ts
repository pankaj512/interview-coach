// S8a hardening: service auth gate, probes/metrics, quotas, headers, hygiene.
//
// In-memory repos + fake voice provider; no DB needed.

import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "@interview-coach/domain";
import { buildApp, type BuiltBackend } from "../src/app.js";
import { loadConfig, type BackendConfig } from "../src/config.js";
import {
  FakeVoiceSessionProvider,
  UnconfiguredVoiceSessionProvider,
} from "../src/voice-session.js";
import { buildTestBackend, createStartedInterview, type TestBackend } from "./helpers.js";

let backend: TestBackend | BuiltBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

function configWith(env: Record<string, string>): BackendConfig {
  return loadConfig({ ...process.env, ...env });
}

function authedBackend(env: Record<string, string>): BuiltBackend {
  const built = buildApp({
    repos: createInMemoryRepositories(),
    config: configWith(env),
    voiceProvider: new FakeVoiceSessionProvider(),
    logger: false,
  });
  backend = built;
  return built;
}

const AUTH = "s8a-test-token-abc123";

describe("s8a auth gate", () => {
  it("leaves health and ready open but gates /api with 401", async () => {
    const app = authedBackend({ API_AUTH_TOKEN: AUTH });
    expect((await app.app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    expect((await app.app.inject({ method: "GET", url: "/api/ready" })).statusCode).toBe(200);

    const denied = await app.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json()).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED", retryable: false },
    });

    const wrong = await app.app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: { authorization: "Bearer wrong" },
      payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
    });
    expect(wrong.statusCode).toBe(401);

    const allowed = await app.app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: { authorization: `Bearer ${AUTH}` },
      payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
    });
    expect(allowed.statusCode).toBe(201);
  });

  it("gates metrics the same way", async () => {
    const app = authedBackend({ API_AUTH_TOKEN: AUTH });
    expect((await app.app.inject({ method: "GET", url: "/api/metrics" })).statusCode).toBe(401);
    const res = await app.app.inject({
      method: "GET",
      url: "/api/metrics",
      headers: { authorization: `Bearer ${AUTH}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      metrics: { interviewsCreated: 0, toolExecuted: 0 },
    });
  });
});

describe("s8a probes and metrics", () => {
  it("ready reports service state; metrics counts interviews/tools/voice", async () => {
    backend = buildTestBackend();
    const tb = backend as TestBackend;

    const ready = await tb.app.inject({ method: "GET", url: "/api/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ok: true,
      ready: true,
      service: "interview-coach-backend",
      voiceMode: "test",
    });

    const { id } = await createStartedInterview(tb);
    await tb.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: { call_id: "s8a-call-1", tool: "get_interview_state" },
    });
    // Replay counts separately from first execution.
    await tb.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: { call_id: "s8a-call-1", tool: "get_interview_state" },
    });
    await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });

    const metrics = await tb.app.inject({ method: "GET", url: "/api/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json()).toMatchObject({
      ok: true,
      metrics: {
        interviewsCreated: 1,
        toolExecuted: 1,
        toolReplayed: 1,
        toolFailed: 0,
        voiceMinted: 1,
        activeVoiceSessions: 1,
      },
    });
    const snapshot = (metrics.json() as { metrics: Record<string, unknown> }).metrics;
    expect(typeof snapshot["uptimeSeconds"]).toBe("number");
    expect(typeof snapshot["idempotencySize"]).toBe("number");
  });

  it("counts voice rejections and code runs", async () => {
    backend = buildTestBackend();
    const tb = backend as TestBackend;
    const { id } = await createStartedInterview(tb);
    await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    // Completed interviews reject new voice sessions.
    const rejected = await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
    expect(rejected.statusCode).toBe(409);

    const check = await tb.app.inject({ method: "GET", url: "/api/metrics" });
    expect(check.json()).toMatchObject({
      ok: true,
      metrics: { voiceMinted: 0, voiceRejected: 1 },
    });
  });
});

describe("s8a quotas", () => {
  it("caps active voice sessions with a retryable 429", async () => {
    const app = authedBackend({ VOICE_MAX_ACTIVE_SESSIONS: "1" });
    const makeReady = async (): Promise<string> => {
      const created = await app.app.inject({
        method: "POST",
        url: "/api/interviews",
        payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
      });
      const id = (created.json() as { interview: { id: string } }).interview.id;
      await app.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
      return id;
    };
    const first = await makeReady();
    const second = await makeReady();
    expect((await app.app.inject({ method: "POST", url: `/api/interviews/${first}/voice-session` })).statusCode).toBe(201);
    const capped = await app.app.inject({ method: "POST", url: `/api/interviews/${second}/voice-session` });
    expect(capped.statusCode).toBe(429);
    expect(capped.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED", retryable: true },
    });
  });

  it("caps stored submissions per interview with a retryable 429", async () => {
    const app = authedBackend({ CODE_RUN_MAX_SUBMISSIONS_PER_INTERVIEW: "1" });
    const created = await app.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    await app.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
    const code = "function solve(a, b) { return a + b; }";
    const first = await app.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/submissions`,
      payload: { language: "javascript", code },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/submissions`,
      payload: { language: "javascript", code },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED", retryable: true },
    });
  });

  it("rate-limits the tool-exec path with the shared envelope", async () => {
    const app = authedBackend({ RATE_LIMIT_TOOL_EXEC_PER_MIN: "2" });
    const created = await app.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    const toolCall = (n: number): Promise<{ statusCode: number; body: string }> =>
      app.app.inject({
        method: "POST",
        url: `/api/interviews/${id}/tool-exec`,
        payload: { call_id: `s8a-rl-${n}`, tool: "get_interview_state" },
      });
    expect((await toolCall(1)).statusCode).toBe(200);
    expect((await toolCall(2)).statusCode).toBe(200);
    const limited = await app.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: { call_id: "s8a-rl-3", tool: "get_interview_state" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED", retryable: true },
    });
  });

  it("rejects oversized payloads before they reach domain logic", async () => {
    backend = buildTestBackend();
    const tb = backend as TestBackend;
    const { id } = await createStartedInterview(tb);
    const res = await tb.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/responses`,
      payload: { kind: "answer", content: `x`.repeat(300_000) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ ok: false });
  });
});

describe("s8a headers and secret hygiene", () => {
  it("sets security headers on responses", async () => {
    backend = buildTestBackend();
    const res = await (backend as TestBackend).app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("never echoes the server-side voice key in error responses", async () => {
    const secret = "sk-s8a-must-never-leak-999";
    const built = buildApp({
      repos: createInMemoryRepositories(),
      config: configWith({ AZURE_VOICE_API_KEY: secret }),
      voiceProvider: new UnconfiguredVoiceSessionProvider(),
      logger: false,
    });
    backend = built;
    try {
      const missing = await built.app.inject({ method: "GET", url: "/api/interviews/nope/state" });
      expect(missing.statusCode).toBe(404);
      expect(missing.body).not.toContain(secret);

      const created = await built.app.inject({
        method: "POST",
        url: "/api/interviews",
        payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
      });
      const id = (created.json() as { interview: { id: string } }).interview.id;
      await built.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
      const rejected = await built.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
      expect(rejected.statusCode).toBe(503);
      expect(rejected.body).not.toContain(secret);
    } finally {
      // AZURE_VOICE_API_KEY was passed via the config object, not ambient env.
    }
  });
});
