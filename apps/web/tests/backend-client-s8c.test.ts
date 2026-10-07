// S8c account client tests: auth endpoints + session store. Fake fetch,
// memory storage, no network or DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackendClient, type FetchFn } from "../src/api/backend-client.js";

type Init = { method?: string; headers?: Record<string, string>; body?: string };

function fakeFetch(
  handler: (url: string, init?: Init) => { status: number; body: unknown },
): FetchFn {
  return async (input: string, init?: Init) => ({
    status: handler(input, init).status,
    json: async () => handler(input, init).body,
  });
}

const SESSION = {
  user: { id: "user_1", email: "a@example.com", displayName: "A", createdAt: "2026-09-11T00:00:00.000Z" },
  session: { token: "tok_abc", expiresAt: "2026-10-11T00:00:00.000Z" },
};

describe("BackendClient S8c auth", () => {
  it("registers, logs in, and logs out", async () => {
    const seen: string[] = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url, init) => {
        seen.push(url);
        const body = init?.body === undefined ? {} : (JSON.parse(init.body) as Record<string, unknown>);
        if (url.endsWith("/auth/register")) {
          expect(body).toMatchObject({ email: "a@example.com", password: "pw" });
          return { status: 201, body: { ok: true, ...SESSION } };
        }
        if (url.endsWith("/auth/login")) {
          return { status: 200, body: { ok: true, ...SESSION } };
        }
        return { status: 200, body: { ok: true } };
      }),
    );
    const reg = await client.register({ email: "a@example.com", displayName: "A", password: "pw" });
    expect(reg.session.token).toBe("tok_abc");
    const login = await client.login({ email: "a@example.com", password: "pw" });
    expect(login.user.email).toBe("a@example.com");
    await client.logout();
    expect(seen.some((u) => u.endsWith("/api/auth/logout"))).toBe(true);
  });

  it("surfaces auth failures as BackendApiError", async () => {
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch(() => ({
        status: 401,
        body: { ok: false, error: { code: "INVALID_CREDENTIALS", message: "nope", retryable: false } },
      })),
    );
    await expect(client.login({ email: "a@example.com", password: "x" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });
});

describe("auth-store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function freshStore() {
    return import("../src/state/auth-store.js");
  }

  it("starts empty, sets, and clears", async () => {
    const store = await freshStore();
    expect(store.getAuthSession()).toBeNull();
    store.setAuthSession({ token: "t", email: "a@b.com", displayName: "A" });
    expect(store.getAuthSession()).toMatchObject({ token: "t", email: "a@b.com" });
    store.clearAuthSession();
    expect(store.getAuthSession()).toBeNull();
  });

  it("rejects corrupt shapes", async () => {
    const store = await freshStore();
    store.setAuthSession({ token: "", email: "a@b.com", displayName: "A" });
    expect(store.getAuthSession()).toBeNull();
  });
});
