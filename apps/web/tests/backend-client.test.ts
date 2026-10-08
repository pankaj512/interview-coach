// BackendClient tests (S4): control-plane contract vs S3 routes. Fake fetch,
// no network.
import { describe, expect, it } from "vitest";
import { BackendApiError, BackendClient, type FetchFn } from "../src/api/backend-client.js";

function fakeFetch(handler: (url: string, init?: { method?: string; body?: string }) => { status: number; body: unknown }): FetchFn {
  return async (input: string, init?: { method?: string; body?: string }) => ({
    status: handler(input, init).status,
    json: async () => handler(input, init).body,
  });
}

const INTERVIEW = {
  id: "int_1",
  candidateId: "ada",
  type: "dsa",
  status: "created",
  configuration: { interviewType: "dsa" },
  problems: [],
  currentOrder: null,
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
};

describe("BackendClient", () => {
  it("strips trailing slashes from the base URL", () => {
    const seen: string[] = [];
    const client = new BackendClient(
      "http://localhost:3000///",
      fakeFetch((url) => {
        seen.push(url);
        return { status: 200, body: { ok: true, service: "x", version: "0.1.0" } };
      }),
    );
    expect(client.url).toBe("http://localhost:3000");
    void client.getHealth().then(() => {
      expect(seen[0]).toBe("http://localhost:3000/api/health");
    });
  });

  it("creates an interview and returns the serialized body", async () => {
    const requests: Array<{ url: string; init?: { method?: string; body?: string } | undefined }> = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url, init) => {
        requests.push({ url, init });
        return { status: 201, body: { ok: true, interview: INTERVIEW } };
      }),
    );
    const interview = await client.createInterview({
      candidateId: "ada",
      configuration: { interviewType: "dsa", difficulty: "Easy" },
    });
    expect(interview.id).toBe("int_1");
    expect(requests[0]?.url).toBe("http://localhost:3000/api/interviews");
    expect(JSON.parse(requests[0]?.init?.body ?? "{}")).toMatchObject({ candidateId: "ada" });
  });

  it("deletes an interview and returns the deleted status", async () => {
    const requests: Array<{ url: string; init?: { method?: string } | undefined }> = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url, init) => {
        requests.push({ url, init });
        return { status: 200, body: { ok: true, deleted: { id: "int_1", status: "completed" } } };
      }),
    );
    const deleted = await client.deleteInterview("int_1");
    expect(deleted).toEqual({ id: "int_1", status: "completed" });
    expect(requests[0]?.init?.method).toBe("DELETE");
  });

  it("omits content-type on bodyless calls (backend rejects empty JSON bodies)", async () => {
    const seen: Array<{ url: string; init?: unknown }> = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url, init) => {
        seen.push({ url, init });
        return { status: 200, body: { ok: true, interview: INTERVIEW } };
      }),
    );
    await client.markReady("int_1");
    const headers = (seen[0]?.init as { headers?: Record<string, string> } | undefined)?.headers;
    expect(headers).toBeUndefined();
  });

  it("maps error envelopes to BackendApiError with code and retryable", async () => {
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch(() => ({
        status: 409,
        body: { ok: false, error: { code: "ILLEGAL_TRANSITION", message: "nope", retryable: false } },
      })),
    );
    const error = await client.startInterview("int_1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendApiError);
    expect((error as BackendApiError).status).toBe(409);
    expect((error as BackendApiError).code).toBe("ILLEGAL_TRANSITION");
    expect((error as BackendApiError).retryable).toBe(false);
  });

  it("maps network failures to retryable NETWORK_ERROR", async () => {
    const client = new BackendClient("http://localhost:3000", (async () => {
      throw new Error("boom");
    }) as FetchFn);
    const error = await client.getState("int_1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendApiError);
    expect((error as BackendApiError).code).toBe("NETWORK_ERROR");
    expect((error as BackendApiError).retryable).toBe(true);
  });

  it("returns tool-exec success as data with replay flag", async () => {
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch(() => ({
        status: 200,
        body: { ok: true, callId: "call_1", tool: "get_current_interview", result: { status: "in_progress" }, replayed: true },
      })),
    );
    const outcome = await client.toolExec("int_1", "call_1", "get_current_interview");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toMatchObject({ status: "in_progress" });
      expect(outcome.replayed).toBe(true);
    }
  });

  it("returns permanent tool failures as data instead of throwing", async () => {
    const seen: string[] = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url) => {
        seen.push(url);
        return {
          status: 409,
          body: {
            ok: false,
            error: { code: "ILLEGAL_TRANSITION", message: "cannot end", retryable: false },
            callId: "call_9",
            tool: "end_interview",
            replayed: false,
          },
        };
      }),
    );
    const outcome = await client.toolExec("int_1", "call_9", "end_interview");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("ILLEGAL_TRANSITION");
      expect(outcome.retryable).toBe(false);
      expect(outcome.callId).toBe("call_9");
    }
    expect(seen[0]).toContain("/api/interviews/int_1/tool-exec");
  });

  it("throws retryable errors for 5xx tool-exec responses", async () => {
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch(() => ({ status: 503, body: { unexpected: true } })),
    );
    const error = await client.toolExec("int_1", "call_1", "get_current_interview").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendApiError);
    expect((error as BackendApiError).retryable).toBe(true);
  });

  it("returns null for unknown tool-results call_id (recovery probe)", async () => {
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch(() => ({ status: 404, body: { ok: false, error: { code: "NOT_FOUND", message: "x", retryable: false } } })),
    );
    await expect(client.toolResult("int_1", "call_missing")).resolves.toBeNull();
  });

  it("mints and deletes voice sessions", async () => {
    const urls: string[] = [];
    const session = {
      websocketUrl: "wss://voice/voice-live/realtime?api-version=2026-04-10&model=gpt-realtime-mini",
      endpoint: "https://voice",
      model: "gpt-realtime-mini",
      apiVersion: "2026-04-10",
      voice: "alloy",
      ttlSeconds: 600,
      expiresAt: "2026-09-11T00:10:00.000Z",
      credential: { tokenType: "api-key", token: "dev-only" },
      credentialMode: "api-key-local-dev",
      sessionConfig: {},
      instructions: "hi",
    };
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url, init) => {
        urls.push(`${init?.method ?? "GET"} ${url}`);
        if ((init?.method ?? "GET") === "DELETE") return { status: 200, body: { ok: true, active: false } };
        return { status: 201, body: { ok: true, session } };
      }),
    );
    const minted = await client.createVoiceSession("int_1");
    expect(minted.model).toBe("gpt-realtime-mini");
    await client.deleteVoiceSession("int_1");
    expect(urls).toContain("POST http://localhost:3000/api/interviews/int_1/voice-session");
    expect(urls).toContain("DELETE http://localhost:3000/api/interviews/int_1/voice-session");
  });

  it("calls the global fetch without a foreign `this` (browser Window requirement)", async () => {
    const original = (globalThis as { fetch?: unknown })["fetch"];
    let receiver: unknown = "unset";
    (globalThis as { fetch?: unknown })["fetch"] = function (this: unknown) {
      receiver = this;
      return Promise.resolve({
        status: 200,
        json: async () => ({ ok: true, service: "s", version: "1" }),
      });
    };
    try {
      // No fetchFn injected: the client uses the default wrapper.
      const client = new BackendClient("http://localhost:3000");
      await client.getHealth();
      // A bare `window.fetch` call with `this = BackendClient` throws
      // "called on an object that does not implement interface Window".
      expect(receiver === undefined || receiver === globalThis).toBe(true);
    } finally {
      (globalThis as { fetch?: unknown })["fetch"] = original;
    }
  });
});
