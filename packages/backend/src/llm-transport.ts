// @interview-coach/backend — shared server-side LLM chat transport.
//
// One timeout/abort/retry chat-completions call shared by the three second-AI
// model classes (recommendation, evaluation, submit-verdict), with one request
// entry per provider. Providers speak the OpenAI chat-completions envelope
// both ways (`response_format: {type: "json_object"}`,
// `choices[0].message.content`); only URL, auth, model selection, and the
// JSON-safe temperature differ:
//
// - azure: `{ENDPOINT}/openai/deployments/{DEPLOYMENT}/chat/completions?api-version=...`
//   with the `api-key` header and temperature 0.2, no `model` field.
// - inception: `{BASE_URL}/chat/completions` with `Authorization: Bearer` and
//   a `model` field (default mercury-2.5). Mercury resets temperatures below
//   0.5 server-side with a warning, so this entry sends 0.7, never 0.2.
//
// Failures are data, not exceptions (same contract the model classes had
// inline): `{ raw: null, error }` for timeouts, HTTP errors, and exhausted
// retries. Parsing stays in the model classes with their own messages.

import type { LlmConfig } from "./config.js";

export type LlmFetch = (
  input: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal?: AbortSignal;
  },
) => Promise<{ readonly status: number; text(): Promise<string> }>;

export interface ChatMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

// Pulls `choices[0].message.content` out of an OpenAI-compatible response.
export function extractChatContent(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: unknown } | undefined;
  const message = first?.message as { content?: unknown } | undefined;
  return typeof message?.content === "string" ? message.content : null;
}

export function defaultFetch(modelLabel: string): LlmFetch {
  const impl = (globalThis as { fetch?: unknown })["fetch"];
  if (typeof impl !== "function") {
    throw new Error(`No fetch implementation available for the ${modelLabel} model`);
  }
  const fn = impl as (
    input: string,
    init: Record<string, unknown>,
  ) => Promise<{ status: number; text(): Promise<string> }>;
  return (input, init) => fn(input, init);
}

export type LlmProviderName = "azure" | "inception";

export const INCEPTION_DEFAULT_BASE_URL = "https://api.inceptionlabs.ai/v1";
export const INCEPTION_DEFAULT_MODEL = "mercury-2.5";
export const AZURE_TEMPERATURE = 0.2;
export const INCEPTION_TEMPERATURE = 0.7;

// Unknown provider names resolve to null; factories treat null as
// unconfigured (same as missing keys), never a crash.
export function resolveLlmProvider(raw: string | undefined): LlmProviderName | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "azure") return "azure";
  if (value === "inception") return "inception";
  return null;
}

// Azure needs its endpoint + key; inception carries safe defaults for base
// URL and model, so only the key gates it.
export function isProviderConfigured(
  provider: LlmProviderName | null,
  config: { readonly endpoint: string | undefined; readonly apiKey: string | undefined },
): boolean {
  if (provider === null) return false;
  if (provider === "inception") return config.apiKey !== undefined;
  return config.endpoint !== undefined && config.apiKey !== undefined;
}

export interface ChatRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

function trimSlash(base: string): string {
  return base.replace(/\/+$/, "");
}

function orDefault(raw: string | undefined, fallback: string): string {
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

export function buildChatRequest(args: {
  readonly provider: LlmProviderName;
  readonly apiKey: string;
  readonly endpoint: string | undefined;
  readonly deployment: string | undefined;
  readonly apiVersion: string | undefined;
  readonly baseUrl: string | undefined;
  readonly model: string | undefined;
  readonly messages: readonly ChatMessage[];
}): ChatRequest {
  if (args.provider === "inception") {
    const base = orDefault(args.baseUrl, INCEPTION_DEFAULT_BASE_URL);
    const model = orDefault(args.model, INCEPTION_DEFAULT_MODEL);
    return {
      url: `${trimSlash(base)}/chat/completions`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: args.messages,
        temperature: INCEPTION_TEMPERATURE,
        response_format: { type: "json_object" },
      }),
    };
  }
  const url =
    `${trimSlash(args.endpoint ?? "")}` +
    `/openai/deployments/${encodeURIComponent(args.deployment ?? "")}` +
    `/chat/completions?api-version=${encodeURIComponent(args.apiVersion ?? "")}`;
  return {
    url,
    headers: {
      "content-type": "application/json",
      "api-key": args.apiKey,
    },
    body: JSON.stringify({
      messages: args.messages,
      temperature: AZURE_TEMPERATURE,
      response_format: { type: "json_object" },
    }),
  };
}

export interface ChatPostDeps {
  readonly fetchImpl: LlmFetch;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly errorPrefix: string;
}

async function attemptOnce(
  fetchImpl: LlmFetch,
  url: string,
  headers: Readonly<Record<string, string>>,
  body: string,
  timeoutMs: number,
  errorPrefix: string,
): Promise<{ raw: string | null; error: string; retryable: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let status: number;
  let text: string;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    status = response.status;
    text = await response.text();
  } catch (error) {
    return {
      raw: null,
      error:
        error instanceof Error && error.name === "AbortError"
          ? `${errorPrefix} timed out`
          : `${errorPrefix} request failed`,
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
  if (status < 200 || status >= 300) {
    return {
      raw: null,
      error: `${errorPrefix} returned HTTP ${status}`,
      retryable: status === 429 || status >= 500,
    };
  }
  return { raw: text, error: "", retryable: false };
}

// Retrying POST loop shared by all three model classes: permanent (non-
// retryable) failures return immediately, transient ones retry through
// maxRetries, and the last error wins when retries are exhausted.
export async function postChatCompletions(
  url: string,
  headers: Readonly<Record<string, string>>,
  body: string,
  deps: ChatPostDeps,
): Promise<{ raw: string | null; error: string }> {
  let lastError = `${deps.errorPrefix} unavailable`;
  for (let attempt = 0; attempt <= deps.maxRetries; attempt += 1) {
    const outcome = await attemptOnce(
      deps.fetchImpl,
      url,
      headers,
      body,
      deps.timeoutMs,
      deps.errorPrefix,
    );
    if (outcome.raw !== null) return { raw: outcome.raw, error: "" };
    lastError = outcome.error;
    if (!outcome.retryable) return { raw: null, error: lastError };
  }
  return { raw: null, error: lastError };
}

