// S3 voice-session: mint (credential boundary), auto-start, cleanup.

import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  ApiKeyLocalDevVoiceSessionProvider,
  FakeVoiceSessionProvider,
  UnconfiguredVoiceSessionProvider,
  buildSessionInstructions,
  createVoiceSessionProviderFromEnv,
} from "../src/voice-session.js";
import { createInMemoryRepositories } from "@interview-coach/domain";
import { buildTestBackend, createStartedInterview, seedCurriculum } from "./helpers.js";
import type { TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

describe("voice-session", () => {
  it("mints a session for a ready interview and auto-starts it", async () => {
    backend = buildTestBackend();
    const created = await backend.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });

    const res = await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
    expect(res.statusCode).toBe(201);
    const session = (res.json() as { session: Record<string, unknown> }).session;
    expect(session["credential"]).toEqual({ tokenType: "bearer", token: "eph_test_token" });
    expect(session["credentialMode"]).toBe("test");
    expect(session["model"]).toBe("gpt-realtime-mini");
    expect(session["voice"]).toBe("en-US-Andrew:DragonHDLatestNeural");
    expect(session["websocketUrl"] as string).toContain("/voice-live/realtime");
    expect(session["sessionConfig"]).toMatchObject({
      turnDetection: { type: "server_vad", threshold: 0.35 },
    });
    expect(typeof session["instructions"]).toBe("string");
    expect(backend.activeVoiceSessions.has(id)).toBe(true);

    const state = await backend.app.inject({ method: "GET", url: `/api/interviews/${id}/state` });
    expect((state.json() as { state: { interview: { status: string } } }).state.interview.status).toBe(
      "in_progress",
    );
  });

  it("rejects voice sessions for interviews that are not ready/running", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    const res = await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ ok: false, error: { code: "ILLEGAL_TRANSITION" } });
  });

  it("cleans up the session record on DELETE (idempotent)", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
    expect(backend.activeVoiceSessions.has(id)).toBe(true);
    const first = await backend.app.inject({ method: "DELETE", url: `/api/interviews/${id}/voice-session` });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true, active: false });
    expect(backend.activeVoiceSessions.has(id)).toBe(false);
    const second = await backend.app.inject({ method: "DELETE", url: `/api/interviews/${id}/voice-session` });
    expect(second.statusCode).toBe(200);
  });

  it("returns 503 when no voice credential is configured", async () => {
    const repos = createInMemoryRepositories();
    const built = buildApp({
      repos,
      config: loadConfig({ ...process.env }),
      voiceProvider: new UnconfiguredVoiceSessionProvider(),
      logger: false,
    });
    try {
      const created = await built.app.inject({
        method: "POST",
        url: "/api/interviews",
        payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
      });
      const id = (created.json() as { interview: { id: string } }).interview.id;
      await built.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
      const res = await built.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ ok: false, error: { code: "VOICE_NOT_CONFIGURED" } });
    } finally {
      await built.app.close();
    }
  });

  it("V3-4: a 503 mint does not start the interview", async () => {
    const repos = createInMemoryRepositories();
    const built = buildApp({
      repos,
      config: loadConfig({ ...process.env }),
      voiceProvider: new UnconfiguredVoiceSessionProvider(),
      logger: false,
    });
    try {
      const created = await built.app.inject({
        method: "POST",
        url: "/api/interviews",
        payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
      });
      const id = (created.json() as { interview: { id: string } }).interview.id;
      await built.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
      const res = await built.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
      expect(res.statusCode).toBe(503);
      const state = await built.app.inject({ method: "GET", url: `/api/interviews/${id}/state` });
      expect((state.json() as { state: { interview: { status: string } } }).state.interview.status).toBe("ready");
    } finally {
      await built.app.close();
    }
  });

  it("V3-1: expired sessions are swept from the quota map", async () => {
    const repos = createInMemoryRepositories();
    const built = buildApp({
      repos,
      config: loadConfig({ ...process.env }),
      voiceProvider: new FakeVoiceSessionProvider(0),
      logger: false,
    });
    try {
      const created = await built.app.inject({
        method: "POST",
        url: "/api/interviews",
        payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
      });
      const id = (created.json() as { interview: { id: string } }).interview.id;
      await built.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
      await built.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
      expect(built.activeVoiceSessions.size).toBe(1);
      await built.app.inject({ method: "GET", url: "/api/ready" });
      expect(built.activeVoiceSessions.size).toBe(0);
    } finally {
      await built.app.close();
    }
  });

  it("V3-5: api-key voice mode refuses production without explicit opt-in", () => {
    const prod = { ...process.env, NODE_ENV: "production", AZURE_VOICE_API_KEY: "sk-prod" };
    delete (prod as Record<string, string | undefined>)["ALLOW_INSECURE_VOICE_API_KEY"];
    expect(() => createVoiceSessionProviderFromEnv(prod)).toThrow(/local-dev only/);
    expect(
      createVoiceSessionProviderFromEnv({ ...prod, ALLOW_INSECURE_VOICE_API_KEY: "true" }),
    ).toBeInstanceOf(ApiKeyLocalDevVoiceSessionProvider);
    expect(
      createVoiceSessionProviderFromEnv({ ...prod, NODE_ENV: "development" }),
    ).toBeInstanceOf(ApiKeyLocalDevVoiceSessionProvider);
  });

  it("never leaks the server-side api key outside local-dev mode", async () => {
    const secret = "sk-live-should-never-leak-12345";
    process.env["AZURE_VOICE_API_KEY"] = secret;
    try {
      backend = buildTestBackend();
      const { id } = await createStartedInterview(backend);
      const res = await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
      expect(res.statusCode).toBe(201);
      expect(res.body).not.toContain(secret);
    } finally {
      delete process.env["AZURE_VOICE_API_KEY"];
    }
  });

  it("flags local-dev api-key mode explicitly", async () => {
    const repos = createInMemoryRepositories();
    const built = buildApp({
      repos,
      config: loadConfig({ ...process.env }),
      voiceProvider: new ApiKeyLocalDevVoiceSessionProvider("dev-only-key", 600),
      logger: false,
    });
    try {
      const created = await built.app.inject({
        method: "POST",
        url: "/api/interviews",
        payload: { candidateId: "user_1", configuration: { interviewType: "dsa" } },
      });
      const id = (created.json() as { interview: { id: string } }).interview.id;
      await built.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
      const res = await built.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        ok: true,
        session: {
          credentialMode: "api-key-local-dev",
          credential: { tokenType: "api-key", token: "dev-only-key" },
        },
      });
    } finally {
      await built.app.close();
    }
  });

  // Phase 7: the injected learning-loop context is rendered into the
  // instructions and the opening behavior tells the model to state the
  // problem from context.
  it("phase 7: renders profile/topic/objective/skill context and states the problem on open", () => {
    const instructions = buildSessionInstructions({
      candidateId: "user_1",
      interviewId: "int_1",
      profileSummary: "Preparing for Senior Backend Engineer (Data Structures & Algorithms)",
      topicSummary: "Arrays (module: Arrays & Hashing)",
      objectiveSummary: "Build fluency with linear scans",
      skillSummary: "mastery Developing; 2/4 successful attempts",
      problemSummary: "Move Zeroes (Easy) — two pointers",
    });
    expect(instructions).toContain("Learner: Preparing for Senior Backend Engineer");
    expect(instructions).toContain("Focus topic: Arrays (module: Arrays & Hashing).");
    expect(instructions).toContain("Learning objective: Build fluency with linear scans.");
    expect(instructions).toContain("Prior skill state: mastery Developing");
    expect(instructions).toContain("Current problem: Move Zeroes (Easy)");
    expect(instructions).toContain("state the current problem from the session context");
    // No context fields: the generic interview still renders without the lines.
    const bare = buildSessionInstructions({ candidateId: "user_1", interviewId: "int_1" });
    expect(bare).not.toContain("Learner:");
    expect(bare).not.toContain("Focus topic:");
  });

  // Phase 7: a user-session mint loads the server-owned profile + curriculum +
  // skill state and injects them; the service/anonymous path stays generic.
  it("phase 7: injects server-owned context for a signed-in user", async () => {
    backend = buildTestBackend();
    await seedCurriculum(backend.repos);
    const registered = await backend.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "ctx@example.com", displayName: "Ctx User", password: "correct-horse-123" },
    });
    const token = (registered.json() as { session: { token: string } }).session.token;
    const auth = { authorization: `Bearer ${token}` };
    await backend.app.inject({
      method: "PUT",
      url: "/api/profile",
      headers: auth,
      payload: {
        interviewTypes: ["dsa"],
        role: "backend_engineer",
        level: "senior",
        goals: "Sharpen arrays",
      },
    });
    const created = await backend.app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: auth,
      payload: { candidateId: "Ctx User", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/problems`,
      headers: auth,
      payload: { problemIds: ["prob_move-zeroes"] },
    });
    await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/ready`,
      headers: auth,
    });

    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/voice-session`,
      headers: auth,
    });
    expect(res.statusCode).toBe(201);
    const instructions = (res.json() as { session: { instructions: string } }).session.instructions;
    expect(instructions).toContain("Learner: Preparing for Senior Backend Engineer");
    expect(instructions).toContain("Focus topic: Arrays");
    expect(instructions).toContain("Learning objective:");
    expect(instructions).toContain("Current problem: Move Zeroes (Easy)");

    // Same interview minted by a service/anonymous caller: no user context.
    const anon = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/voice-session`,
    });
    expect(anon.statusCode).toBe(201);
    const anonInstructions = (anon.json() as { session: { instructions: string } }).session.instructions;
    expect(anonInstructions).not.toContain("Learner:");
    expect(anonInstructions).toContain("Current problem: Move Zeroes (Easy)");
  });
});
