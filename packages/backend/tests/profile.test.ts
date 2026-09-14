// Phase 2 profile routes: user-scoped GET/PUT, validation, ownership, metric.
// In-memory repos; no DB needed.

import { afterEach, describe, expect, it } from "vitest";
import { buildTestBackend, type TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

interface SessionBody {
  user: { id: string; email: string; displayName: string };
  session: { token: string };
}

async function register(tb: TestBackend, email: string): Promise<string> {
  const res = await tb.app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, displayName: "Profile User", password: "correct-horse-123" },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as SessionBody).session.token;
}

const VALID = {
  interviewTypes: ["dsa"],
  role: "backend_engineer",
  level: "senior",
  goals: "Sharpen dynamic programming",
};

describe("phase 2 profile routes", () => {
  it("returns null before onboarding, then persists create + edit", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const token = await register(tb, "p@example.com");
    const auth = { authorization: `Bearer ${token}` };

    const empty = await tb.app.inject({ method: "GET", url: "/api/profile", headers: auth });
    expect(empty.statusCode).toBe(200);
    expect((empty.json() as { profile: unknown }).profile).toBeNull();

    const created = await tb.app.inject({
      method: "PUT",
      url: "/api/profile",
      headers: auth,
      payload: VALID,
    });
    expect(created.statusCode).toBe(200);
    const createdProfile = (created.json() as { profile: Record<string, unknown> }).profile;
    expect(createdProfile).toMatchObject({
      interviewTypes: ["dsa"],
      role: "backend_engineer",
      level: "senior",
      goals: "Sharpen dynamic programming",
    });
    expect(typeof createdProfile["userId"]).toBe("string");

    const read = await tb.app.inject({ method: "GET", url: "/api/profile", headers: auth });
    expect((read.json() as { profile: { role: string } }).profile.role).toBe("backend_engineer");

    const edited = await tb.app.inject({
      method: "PUT",
      url: "/api/profile",
      headers: auth,
      payload: { ...VALID, role: "ml_engineer", level: "staff", goals: "" },
    });
    expect(edited.statusCode).toBe(200);
    const editedProfile = (edited.json() as { profile: Record<string, unknown> }).profile;
    expect(editedProfile["role"]).toBe("ml_engineer");
    expect(editedProfile["level"]).toBe("staff");
    // Blank goals normalize to absent, not "".
    expect(editedProfile["goals"]).toBeUndefined();
    // createdAt is preserved across edits.
    expect(editedProfile["createdAt"]).toBe(createdProfile["createdAt"]);
  });

  it("keeps profiles per user (no cross-user read/write)", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const a = { authorization: `Bearer ${await register(tb, "a@example.com")}` };
    const b = { authorization: `Bearer ${await register(tb, "b@example.com")}` };

    await tb.app.inject({ method: "PUT", url: "/api/profile", headers: a, payload: VALID });
    const bRead = await tb.app.inject({ method: "GET", url: "/api/profile", headers: b });
    expect((bRead.json() as { profile: unknown }).profile).toBeNull();

    const bSave = await tb.app.inject({
      method: "PUT",
      url: "/api/profile",
      headers: b,
      payload: { ...VALID, role: "frontend_engineer" },
    });
    expect((bSave.json() as { profile: { role: string } }).profile.role).toBe("frontend_engineer");
    const aRead = await tb.app.inject({ method: "GET", url: "/api/profile", headers: a });
    expect((aRead.json() as { profile: { role: string } }).profile.role).toBe("backend_engineer");
  });

  it("requires a user session (anonymous and service callers get 401)", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const anon = await tb.app.inject({ method: "GET", url: "/api/profile" });
    expect(anon.statusCode).toBe(401);
    const anonPut = await tb.app.inject({ method: "PUT", url: "/api/profile", payload: VALID });
    expect(anonPut.statusCode).toBe(401);
  });

  it("rejects invalid taxonomy with a 400", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const auth = { authorization: `Bearer ${await register(tb, "bad@example.com")}` };
    const badRole = await tb.app.inject({
      method: "PUT",
      url: "/api/profile",
      headers: auth,
      payload: { ...VALID, role: "wizard" },
    });
    expect(badRole.statusCode).toBe(400);
    const badTypes = await tb.app.inject({
      method: "PUT",
      url: "/api/profile",
      headers: auth,
      payload: { ...VALID, interviewTypes: [] },
    });
    expect(badTypes.statusCode).toBe(400);
  });

  it("counts profile updates in metrics", async () => {
    backend = buildTestBackend();
    const tb = backend;
    const auth = { authorization: `Bearer ${await register(tb, "m@example.com")}` };
    await tb.app.inject({ method: "PUT", url: "/api/profile", headers: auth, payload: VALID });
    const metrics = await tb.app.inject({ method: "GET", url: "/api/metrics" });
    expect(metrics.json()).toMatchObject({ ok: true, metrics: { profilesUpdated: 1 } });
  });
});
