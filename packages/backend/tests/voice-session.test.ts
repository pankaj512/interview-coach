// S3 voice-session: mint (credential boundary), auto-start, cleanup.

import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  ApiKeyLocalDevVoiceSessionProvider,
  UnconfiguredVoiceSessionProvider,
} from "../src/voice-session.js";
import { createInMemoryRepositories } from "@interview-coach/domain";
import { buildTestBackend, createStartedInterview } from "./helpers.js";
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
});
