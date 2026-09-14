// Phase 6 Lobby client test: GET /api/ready URL + shape, and the 503
// NOT_READY surfacing (retryable). Fake fetch, no network.
import { describe, expect, it } from "vitest";
import { BackendClient, type FetchFn } from "../src/api/backend-client.js";

type Init = { method?: string; headers?: Record<string, string>; body?: string };

function recordingFetch(
  respond: () => { status: number; body: unknown },
): { fetch: FetchFn; calls: { url: string; method: string }[] } {
  const calls: { url: string; method: string }[] = [];
  const fetch: FetchFn = async (input: string, init?: Init) => {
    calls.push({ url: input, method: init?.method ?? "GET" });
    const result = respond();
    return { status: result.status, json: async () => result.body };
  };
  return { fetch, calls };
}

describe("BackendClient lobby readiness", () => {
  it("GETs /api/ready and returns the voice mode", async () => {
    const { fetch, calls } = recordingFetch(() => ({
      status: 200,
      body: {
        ok: true,
        ready: true,
        service: "interview-coach-backend",
        version: "0.0.0",
        voiceMode: "api-key-local-dev",
        activeVoiceSessions: 2,
      },
    }));
    const client = new BackendClient("http://localhost:3000", fetch);
    const ready = await client.getReady();
    expect(ready.voiceMode).toBe("api-key-local-dev");
    expect(ready.ready).toBe(true);
    expect(calls[0]?.url).toBe("http://localhost:3000/api/ready");
    expect(calls[0]?.method).toBe("GET");
  });

  it("surfaces a 503 NOT_READY as a retryable BackendApiError", async () => {
    const { fetch } = recordingFetch(() => ({
      status: 503,
      body: { ok: false, error: { code: "NOT_READY", message: "Repository unreachable", retryable: true } },
    }));
    const client = new BackendClient("http://localhost:3000", fetch);
    await expect(client.getReady()).rejects.toMatchObject({ status: 503, code: "NOT_READY", retryable: true });
  });
});
