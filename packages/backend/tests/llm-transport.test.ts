// Feature 21: shared LLM chat transport - per-provider request entries,
// provider resolution + configured gates, and the retrying POST loop.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AZURE_TEMPERATURE,
  buildChatRequest,
  defaultFetch,
  INCEPTION_DEFAULT_BASE_URL,
  INCEPTION_DEFAULT_MODEL,
  INCEPTION_TEMPERATURE,
  isProviderConfigured,
  postChatCompletions,
  resolveLlmProvider,
  type ChatMessage,
  type LlmFetch,
} from "../src/llm-transport.js";

const MESSAGES: readonly ChatMessage[] = [
  { role: "system", content: "sys" },
  { role: "user", content: "hi" },
];

function fakeFetch(calls: unknown[], script: Array<{ status: number; body: string } | { throw: unknown }>): LlmFetch {
  let n = 0;
  return async (input: string, init) => {
    calls.push({ input, init });
    const step = script[Math.min(n, script.length - 1)] as
      | { status: number; body: string }
      | { throw: unknown };
    n += 1;
    if ("throw" in step) throw step.throw;
    return { status: step.status, text: async () => step.body };
  };
}

const DEPS = { timeoutMs: 1000, maxRetries: 2, errorPrefix: "Probe model" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveLlmProvider", () => {
  it("resolves azure and inception case-insensitively", () => {
    expect(resolveLlmProvider("azure")).toBe("azure");
    expect(resolveLlmProvider(" Azure ")).toBe("azure");
    expect(resolveLlmProvider("INCEPTION")).toBe("inception");
  });
  it("resolves unknown, blank, and missing names to null", () => {
    expect(resolveLlmProvider("openai")).toBeNull();
    expect(resolveLlmProvider("")).toBeNull();
    expect(resolveLlmProvider(undefined)).toBeNull();
  });
});

describe("isProviderConfigured", () => {
  it("gates azure on endpoint plus key", () => {
    expect(isProviderConfigured("azure", { endpoint: "https://e", apiKey: "k" })).toBe(true);
    expect(isProviderConfigured("azure", { endpoint: undefined, apiKey: "k" })).toBe(false);
    expect(isProviderConfigured("azure", { endpoint: "https://e", apiKey: undefined })).toBe(false);
  });
  it("gates inception on the key alone", () => {
    expect(isProviderConfigured("inception", { endpoint: undefined, apiKey: "k" })).toBe(true);
    expect(isProviderConfigured("inception", { endpoint: undefined, apiKey: undefined })).toBe(false);
  });
  it("treats an unknown provider as unconfigured", () => {
    expect(isProviderConfigured(null, { endpoint: "https://e", apiKey: "k" })).toBe(false);
  });
});

describe("buildChatRequest", () => {
  it("reproduces the azure request shape exactly", () => {
    const req = buildChatRequest({
      provider: "azure",
      apiKey: "key-1",
      endpoint: "https://foundry.example/",
      deployment: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      baseUrl: undefined,
      model: undefined,
      messages: MESSAGES,
    });
    expect(req.url).toBe(
      "https://foundry.example/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21",
    );
    expect(req.headers).toEqual({
      "content-type": "application/json",
      "api-key": "key-1",
    });
    const body = JSON.parse(req.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      temperature: AZURE_TEMPERATURE,
      response_format: { type: "json_object" },
    });
    expect(body).not.toHaveProperty("model");
    expect(AZURE_TEMPERATURE).toBe(0.2);
  });

  it("builds the inception request with Bearer auth, model, and safe temperature", () => {
    const req = buildChatRequest({
      provider: "inception",
      apiKey: "key-2",
      endpoint: undefined,
      deployment: undefined,
      apiVersion: undefined,
      baseUrl: undefined,
      model: undefined,
      messages: MESSAGES,
    });
    expect(req.url).toBe(`${INCEPTION_DEFAULT_BASE_URL}/chat/completions`);
    expect(req.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer key-2",
    });
    const body = JSON.parse(req.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: INCEPTION_DEFAULT_MODEL,
      temperature: INCEPTION_TEMPERATURE,
      response_format: { type: "json_object" },
    });
    expect(INCEPTION_TEMPERATURE).toBeGreaterThanOrEqual(0.5);
  });

  it("honours explicit inception base URL and model, trimming slashes", () => {
    const req = buildChatRequest({
      provider: "inception",
      apiKey: "key-3",
      endpoint: undefined,
      deployment: undefined,
      apiVersion: undefined,
      baseUrl: "https://proxy.example/v1/",
      model: "mercury-2.5-custom",
      messages: MESSAGES,
    });
    expect(req.url).toBe("https://proxy.example/v1/chat/completions");
    expect((JSON.parse(req.body) as { model: string }).model).toBe("mercury-2.5-custom");
  });
});

describe("postChatCompletions", () => {
  it("returns raw text on success", async () => {
    const calls: unknown[] = [];
    const out = await postChatCompletions("https://x", { a: "b" }, "{}", {
      ...DEPS,
      fetchImpl: fakeFetch(calls, [{ status: 200, body: "hello" }]),
    });
    expect(out).toEqual({ raw: "hello", error: "" });
    expect(calls).toHaveLength(1);
  });

  it("surfaces permanent HTTP failures immediately without retry", async () => {
    const calls: unknown[] = [];
    const out = await postChatCompletions("https://x", {}, "{}", {
      ...DEPS,
      fetchImpl: fakeFetch(calls, [{ status: 400, body: "bad" }]),
    });
    expect(out).toEqual({ raw: null, error: "Probe model returned HTTP 400" });
    expect(calls).toHaveLength(1);
  });

  it("retries transient failures and returns the recovered body", async () => {
    const calls: unknown[] = [];
    const out = await postChatCompletions("https://x", {}, "{}", {
      ...DEPS,
      fetchImpl: fakeFetch(calls, [
        { status: 429, body: "slow" },
        { status: 200, body: "recovered" },
      ]),
    });
    expect(out).toEqual({ raw: "recovered", error: "" });
    expect(calls).toHaveLength(2);
  });

  it("keeps the last error when retries are exhausted", async () => {
    const calls: unknown[] = [];
    const out = await postChatCompletions("https://x", {}, "{}", {
      ...DEPS,
      fetchImpl: fakeFetch(calls, [{ status: 500, body: "boom" }]),
    });
    expect(out).toEqual({ raw: null, error: "Probe model returned HTTP 500" });
    expect(calls).toHaveLength(3);
  });

  it("maps aborts and transport throws to prefixed errors", async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    const timeout = await postChatCompletions("https://x", {}, "{}", {
      ...DEPS,
      fetchImpl: fakeFetch([], [{ throw: aborted }]),
    });
    expect(timeout.error).toBe("Probe model timed out");
    const failed = await postChatCompletions("https://x", {}, "{}", {
      ...DEPS,
      fetchImpl: fakeFetch([], [{ throw: new Error("down") }]),
    });
    expect(failed.error).toBe("Probe model request failed");
  });
});

describe("defaultFetch", () => {
  it("throws a labelled error when no fetch implementation exists", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => defaultFetch("probe")).toThrow(
      "No fetch implementation available for the probe model",
    );
  });
});
