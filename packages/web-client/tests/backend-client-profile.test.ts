// Phase 2 profile client tests: GET/PUT shapes + bearer header. Fake fetch,
// no network.
import { describe, expect, it } from "vitest";
import { BackendClient, type FetchFn } from "../src/api/backend-client.js";

type Init = { method?: string; headers?: Record<string, string>; body?: string };

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

function recordingFetch(
  respond: (call: Call) => { status: number; body: unknown },
): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchFn = async (input: string, init?: Init) => {
    const call: Call = {
      url: input,
      method: init?.method ?? "GET",
      body: init?.body === undefined ? null : (JSON.parse(init.body) as Record<string, unknown>),
    };
    calls.push(call);
    const result = respond(call);
    return { status: result.status, json: async () => result.body };
  };
  return { fetch, calls };
}

const PROFILE = {
  userId: "user_1",
  interviewTypes: ["dsa"],
  role: "backend_engineer",
  level: "senior",
  goals: "practice",
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

describe("BackendClient profile", () => {
  it("GETs /api/profile and returns null before onboarding", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 200,
      body: { ok: true, profile: null },
    }));
    const client = new BackendClient("http://localhost:3000", fetch, { authToken: "tok" });
    const profile = await client.getProfile();
    expect(profile).toBeNull();
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("http://localhost:3000/api/profile");
  });

  it("PUTs /api/profile with the bearer token and unwraps the profile", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 200,
      body: { ok: true, profile: PROFILE },
    }));
    const client = new BackendClient("http://localhost:3000", fetch, { authToken: "tok" });
    const saved = await client.putProfile({
      interviewTypes: ["dsa"],
      role: "backend_engineer",
      level: "senior",
      goals: "practice",
    });
    expect(saved.role).toBe("backend_engineer");
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.body).toEqual({
      interviewTypes: ["dsa"],
      role: "backend_engineer",
      level: "senior",
      goals: "practice",
    });
  });

  it("omits goals when absent and surfaces 401 as BackendApiError", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 401,
      body: { ok: false, error: { code: "UNAUTHORIZED", message: "Sign in", retryable: false } },
    }));
    const client = new BackendClient("http://localhost:3000", fetch);
    await expect(
      client.putProfile({ interviewTypes: ["dsa"], role: "other", level: "entry" }),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(calls[0]?.body).toEqual({ interviewTypes: ["dsa"], role: "other", level: "entry" });
  });
});
