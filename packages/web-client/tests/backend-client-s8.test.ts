// BackendClient S8a tests: optional bearer token (local-dev-only). Fake
// fetch, no network.
import { describe, expect, it } from "vitest";
import { BackendClient, type FetchFn } from "../src/api/backend-client.js";
import { loadWebConfig } from "../src/config.js";

type Init = { method?: string; headers?: Record<string, string>; body?: string };

function fakeFetch(
  handler: (url: string, init?: Init) => { status: number; body: unknown },
): FetchFn {
  return async (input: string, init?: Init) => ({
    status: handler(input, init).status,
    json: async () => handler(input, init).body,
  });
}

describe("BackendClient S8a auth", () => {
  it("sends no Authorization header by default", async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((_url, init) => {
        seen.push(init?.headers);
        return { status: 200, body: { ok: true, service: "x", version: "0.1.0" } };
      }),
    );
    await client.getHealth();
    expect(seen[0]).not.toMatchObject({ authorization: expect.anything() });
  });

  it("attaches the bearer token on control-plane and tool-exec calls", async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((_url, init) => {
        seen.push(init?.headers);
        if ((_url as string).endsWith("/tool-exec")) {
          return { status: 200, body: { ok: true, callId: "c", tool: "get_interview_state", result: {} } };
        }
        return { status: 200, body: { ok: true, service: "x", version: "0.1.0" } };
      }),
      { authToken: "s8a-token" },
    );
    await client.getHealth();
    expect(seen[0]).toMatchObject({ authorization: "Bearer s8a-token" });
    await client.toolExec("int_1", "c", "get_interview_state");
    expect(seen[seen.length - 1]).toMatchObject({ authorization: "Bearer s8a-token" });
  });

  it("reads the optional local-dev token from VITE_API_TOKEN", () => {
    expect(loadWebConfig({ VITE_BACKEND_URL: "http://x:3000" }).apiToken).toBeUndefined();
    expect(loadWebConfig({ VITE_BACKEND_URL: "http://x:3000", VITE_API_TOKEN: "  " }).apiToken).toBeUndefined();
    expect(loadWebConfig({ VITE_BACKEND_URL: "http://x:3000", VITE_API_TOKEN: " tok " }).apiToken).toBe("tok");
  });
});
