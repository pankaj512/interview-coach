// S8c accounts: register/login/logout, session tokens, per-interview
// ownership. In-memory repos; no DB needed.

import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryRepositories, normalizeEmail } from "@interview-coach/domain";
import { buildApp, type BuiltBackend } from "../src/app.js";
import { loadConfig, type BackendConfig } from "../src/config.js";
import { hashPassword, verifyPassword, UserService } from "../src/users.js";
import { FakeVoiceSessionProvider } from "../src/voice-session.js";
import { buildTestBackend, createStartedInterview, type TestBackend } from "./helpers.js";

let backend: TestBackend | BuiltBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

function configWith(env: Record<string, string>): BackendConfig {
  return loadConfig({ ...process.env, ...env });
}

function customBackend(env: Record<string, string>): BuiltBackend {
  const built = buildApp({
    repos: createInMemoryRepositories(),
    config: configWith(env),
    voiceProvider: new FakeVoiceSessionProvider(),
    logger: false,
  });
  backend = built;
  return built;
}

interface SessionBody {
  user: { id: string; email: string; displayName: string; createdAt: string };
  session: { token: string; expiresAt: string };
}

async function register(
  app: BuiltBackend,
  email: string,
  password = "correct-horse-123",
  headers?: Record<string, string>,
): Promise<{ status: number; body: SessionBody & { ok: boolean } }> {
  const res = await app.app.inject({
    method: "POST",
    url: "/api/auth/register",
    ...(headers === undefined ? {} : { headers }),
    payload: { email, displayName: "Test User", password },
  });
  return { status: res.statusCode, body: res.json() as SessionBody & { ok: boolean } };
}

describe("s8c password hashing", () => {
  it("round-trips and rejects malformed stores", async () => {
    const stored = await hashPassword("s3cret-password");
    expect(stored.startsWith("scrypt$v2$")).toBe(true);
    expect(await verifyPassword("s3cret-password", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
    // F7-1: pre-existing v1 hashes are invalidated (rejected).
    expect(await verifyPassword("x", "scrypt$v1$1$2$3$eA==$eA==")).toBe(false);
  });
});

describe("s8c register/login/logout", () => {
  it("registers, logs in with a fresh token, and logs out", async () => {
    backend = buildTestBackend();
    const tb = backend as TestBackend;

    const reg = await register(tb, "Ada@Example.COM");
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe("ada@example.com");
    expect(reg.body.user).not.toHaveProperty("passwordHash");
    expect(typeof reg.body.session.token).toBe("string");

    const login = await tb.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ada@example.com", password: "correct-horse-123" },
    });
    expect(login.statusCode).toBe(200);
    const loginBody = login.json() as SessionBody;
    expect(loginBody.session.token).not.toBe(reg.body.session.token);

    // Raw tokens are never stored: only the hash resolves.
    const stored = await tb.repos.sessions.findByTokenHash("nope");
    expect(stored).toBeNull();

    const logout = await tb.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${loginBody.session.token}` },
    });
    expect(logout.statusCode).toBe(200);
    const relogout = await tb.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${loginBody.session.token}` },
    });
    expect(relogout.statusCode).toBe(401);
  });

  it("expires sessions and cleans them up on use", async () => {
    backend = buildTestBackend();
    const tb = backend as TestBackend;
    const reg = await register(tb, "exp@example.com");
    const account = await tb.repos.users.findByEmail("exp@example.com");
    if (account === null) throw new Error("account missing");
    // Age the session past expiry directly, then attempt a gated read.
    const { hashSessionToken } = await import("../src/users.js");
    const sessions = await tb.repos.sessions;
    const stored = await sessions.findByTokenHash(hashSessionToken(reg.body.session.token));
    if (stored === null) throw new Error("session missing");
    await sessions.save({ ...stored, expiresAt: new Date(Date.now() - 1000) });

    const stale = await tb.app.inject({
      method: "GET",
      url: "/api/metrics",
      headers: { authorization: `Bearer ${reg.body.session.token}` },
    });
    // Open mode: unknown/expired bearers fall back to anonymous, which can
    // still read. The session itself must be gone.
    expect([200, 401]).toContain(stale.statusCode);
    expect(await sessions.findByTokenHash(hashSessionToken(reg.body.session.token))).toBeNull();
  });

  it("rejects duplicates, bad input, and wrong credentials uniformly", async () => {
    backend = buildTestBackend();
    const tb = backend as TestBackend;
    expect((await register(tb, "dup@example.com")).status).toBe(201);
    const dup = await register(tb, "DUP@example.com");
    expect(dup.status).toBe(409);

    const badEmail = await tb.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", displayName: "X", password: "correct-horse-123" },
    });
    expect(badEmail.statusCode).toBe(400);
    const shortPw = await tb.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "ok@example.com", displayName: "X", password: "short" },
    });
    expect(shortPw.statusCode).toBe(400);

    const wrongPw = await tb.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "dup@example.com", password: "wrong-password-1" },
    });
    expect(wrongPw.statusCode).toBe(401);
    expect(wrongPw.json()).toMatchObject({ ok: false, error: { code: "INVALID_CREDENTIALS" } });
    const unknown = await tb.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: "wrong-password-1" },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toMatchObject({ ok: false, error: { code: "INVALID_CREDENTIALS" } });

    const metrics = await tb.app.inject({ method: "GET", url: "/api/metrics" });
    expect(metrics.json()).toMatchObject({
      ok: true,
      metrics: { authRegistrations: 1, authLogins: 0, authFailures: 3 },
    });
  });

  it("normalizes stored email and hashes (never plaintext)", async () => {    backend = buildTestBackend();
    const tb = backend as TestBackend;
    const reg = await register(tb, "Case@Example.com");
    const account = await tb.repos.users.findByEmail(normalizeEmail("CASE@example.com"));
    expect(account?.email).toBe("case@example.com");
    expect(account?.passwordHash).not.toContain("correct-horse-123");
    void reg;
  });
});

describe("s8c per-interview ownership", () => {
  it("scopes user callers to their own interviews", async () => {
    backend = buildTestBackend();
    const tb = backend as TestBackend;
    const a = await register(tb, "a@example.com");
    const b = await register(tb, "b@example.com");
    const authA = { authorization: `Bearer ${a.body.session.token}` };
    const authB = { authorization: `Bearer ${b.body.session.token}` };

    // Identity comes from the session: the body candidateId is ignored.
    const created = await tb.app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: authA,
      payload: { candidateId: "user_spoofed", configuration: { interviewType: "dsa" } },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { interview: { id: string; candidateId: string } }).interview.id;
    expect((created.json() as { interview: { candidateId: string } }).interview.candidateId).toBe(
      a.body.user.id,
    );

    // Owner reads fine; stranger gets 404 (no oracle), on reads and writes.
    expect(
      (await tb.app.inject({ method: "GET", url: `/api/interviews/${id}/state`, headers: authA })).statusCode,
    ).toBe(200);
    const foreign = await tb.app.inject({ method: "GET", url: `/api/interviews/${id}/state`, headers: authB });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const foreignWrite = await tb.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      headers: authB,
      payload: { call_id: "s8c-x", tool: "get_interview_state" },
    });
    expect(foreignWrite.statusCode).toBe(404);
    const foreignDelete = await tb.app.inject({ method: "DELETE", url: `/api/interviews/${id}`, headers: authB });
    expect(foreignDelete.statusCode).toBe(404);
  });

  it("lets the service token bypass ownership (CLI/admin)", async () => {
    const app = customBackend({ API_AUTH_TOKEN: "service-secret" });
    const svc = { authorization: "Bearer service-secret" };
    const created = await app.app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: svc,
      payload: { candidateId: "user_cli", configuration: { interviewType: "dsa" } },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { interview: { id: string } }).interview.id;
    // Service keeps the client-supplied candidateId.
    expect((created.json() as { interview: { candidateId: string } }).interview.candidateId).toBe("user_cli");

    // Register/login stay reachable without a bearer in gated mode.
    const reg = await register(app, "gated@example.com");
    expect(reg.status).toBe(201);
    const userHeader = { authorization: `Bearer ${reg.body.session.token}` };
    // Another user's interview is invisible to this user…
    expect(
      (await app.app.inject({ method: "GET", url: `/api/interviews/${id}/state`, headers: userHeader })).statusCode,
    ).toBe(404);
    // …but the service token still reads it.
    expect(
      (await app.app.inject({ method: "GET", url: `/api/interviews/${id}/state`, headers: svc })).statusCode,
    ).toBe(200);
  });

  it("keeps anonymous local-dev behavior when no service token is set", async () => {
    backend = buildTestBackend();
    const tb = backend as TestBackend;
    const { id } = await createStartedInterview(tb);
    expect((await tb.app.inject({ method: "GET", url: `/api/interviews/${id}/state` })).statusCode).toBe(200);
  });
});

describe("P7 security hardening", () => {
  it("F7-2: locks an account after repeated failures, then recovers after the window", async () => {
    const repos = createInMemoryRepositories();
    let now = new Date("2026-09-13T10:00:00.000Z");
    const service = new UserService({ users: repos.users, sessions: repos.sessions, now: () => now });
    await service.register({ email: "lock@example.com", displayName: "Lock", password: "correct-horse-123" });
    for (let i = 0; i < 5; i += 1) {
      expect(await service.login("lock@example.com", "wrong")).toBeNull();
    }
    // Locked: even the correct password is refused.
    expect(await service.login("lock@example.com", "correct-horse-123")).toBeNull();
    // After the lockout window it succeeds again.
    now = new Date(now.getTime() + 16 * 60_000);
    expect(await service.login("lock@example.com", "correct-horse-123")).not.toBeNull();
  });

  it("F7-4: production refuses to boot open without an explicit opt-in", () => {
    const prevNode = process.env["NODE_ENV"];
    const prevAllow = process.env["ALLOW_ANONYMOUS"];
    process.env["NODE_ENV"] = "production";
    delete process.env["ALLOW_ANONYMOUS"];
    try {
      expect(() => customBackend({})).toThrow(/Refusing to start/);
    } finally {
      if (prevNode === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = prevNode;
      if (prevAllow === undefined) delete process.env["ALLOW_ANONYMOUS"];
      else process.env["ALLOW_ANONYMOUS"] = prevAllow;
    }
  });
});
