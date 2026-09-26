// @interview-coach/backend — server-side submit-verdict model (feature 18d).
//
// The fourth LLM surface: server-side only, never a realtime tool. It reads
// the problem context plus the candidate's editor code and proposes a
// structured verdict (correctness, optimality, break-points, edge cases).
// The model is advisory: the service validates the proposal against the
// domain contract. There is no deterministic fallback — failures are data,
// not exceptions, and the caller surfaces an error instead of an invented
// verdict: timeout/HTTP/unparseable/invalid all yield `{ proposal: null,
// error }`.

import {
  validateSubmitVerdictInput,
  validateSubmitVerdictProposal,
  type SubmitVerdict,
  type SubmitVerdictInput,
  type SubmitVerdictModel,
  type SubmitVerdictModelResult,
} from "@interview-coach/domain";
import type { LlmConfig } from "./config.js";
import {
  extractChatContent,
  type ChatMessage,
  type LlmFetch,
} from "./recommendation-model.js";

function defaultFetch(): LlmFetch {
  const impl = (globalThis as { fetch?: unknown })["fetch"];
  if (typeof impl !== "function") {
    throw new Error("No fetch implementation available for the submit-verdict model");
  }
  const fn = impl as (
    input: string,
    init: Record<string, unknown>,
  ) => Promise<{ status: number; text(): Promise<string> }>;
  return (input, init) => fn(input, init);
}

const SYSTEM_PROMPT = [
  "You are the code-judge engine for a DSA interview-practice coach.",
  "Judge ONLY the provided candidate code against the given problem.",
  "Decide correctness (correct, incorrect, or uncertain when the problem context is missing),",
  "state the judged time/space complexity and whether it is optimal,",
  "list break-points (inputs or conditions where the code fails or degrades),",
  "and list edge cases worth considering.",
  "Never invent executed runs or hidden tests; reason from the code alone.",
  "Reply with ONLY a JSON object, no prose and no markdown, shaped exactly as:",
  '{"correctness": "correct|incorrect|uncertain", "correctnessNotes": "<why>", "optimality": "<time/space>", "optimalityNotes": "<why>", "breakPoints": ["..."], "edgeCases": ["..."], "summary": "<one or two sentences>"}',
].join("\n");

// Deterministic prompt assembly (pure, unit-tested).
export function buildSubmitVerdictMessages(input: SubmitVerdictInput): readonly ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        language: input.language,
        code: input.code,
        problem:
          input.problem === null
            ? null
            : {
                id: input.problem.id,
                title: input.problem.title,
                statement: input.problem.statement,
                constraints: input.problem.constraints,
              },
      }),
    },
  ];
}

// Pulls the first JSON object out of model text (tolerates fences/prose), then
// validates it against the domain verdict contract.
export function parseSubmitVerdictProposal(content: string): SubmitVerdict | null {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  return validateSubmitVerdictProposal(parsed);
}

export interface AzureFoundrySubmitVerdictModelDeps {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly deployment: string;
  readonly apiVersion: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly fetchImpl?: LlmFetch;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export class AzureFoundrySubmitVerdictModel implements SubmitVerdictModel {
  readonly name = "azure-foundry";
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: LlmFetch;

  constructor(deps: AzureFoundrySubmitVerdictModelDeps) {
    this.endpoint = deps.endpoint;
    this.apiKey = deps.apiKey;
    this.deployment = deps.deployment;
    this.apiVersion = deps.apiVersion;
    this.timeoutMs = deps.timeoutMs ?? 20_000;
    this.maxRetries = deps.maxRetries ?? 2;
    this.fetchFn = deps.fetchImpl ?? defaultFetch();
  }

  async judge(input: SubmitVerdictInput): Promise<SubmitVerdictModelResult> {
    const checked = validateSubmitVerdictInput(input);
    if (checked === null) {
      return { proposal: null, error: "Invalid submit-verdict input" };
    }
    const url = joinUrl(
      this.endpoint,
      `/openai/deployments/${encodeURIComponent(this.deployment)}/chat/completions?api-version=${encodeURIComponent(this.apiVersion)}`,
    );
    const body = JSON.stringify({
      messages: buildSubmitVerdictMessages(checked),
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    let lastError = "Submit-verdict model unavailable";
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const outcome = await this.attempt(url, body);
      if (outcome.proposal !== null) return { proposal: outcome.proposal };
      lastError = outcome.error;
      if (!outcome.retryable) return { proposal: null, error: lastError };
    }
    return { proposal: null, error: lastError };
  }

  private async attempt(
    url: string,
    body: string,
  ): Promise<
    | { proposal: SubmitVerdict; error: ""; retryable: false }
    | { proposal: null; error: string; retryable: boolean }
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status: number;
    let text: string;
    try {
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": this.apiKey },
        body,
        signal: controller.signal,
      });
      status = response.status;
      text = await response.text();
    } catch (error) {
      return {
        proposal: null,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Submit-verdict model timed out"
            : "Submit-verdict model request failed",
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
    if (status < 200 || status >= 300) {
      return {
        proposal: null,
        error: `Submit-verdict model returned HTTP ${status}`,
        retryable: status === 429 || status >= 500,
      };
    }
    const content = extractChatContent(text);
    if (content === null) {
      return { proposal: null, error: "Submit-verdict model returned no content", retryable: true };
    }
    const proposal = parseSubmitVerdictProposal(content);
    if (proposal === null) {
      return { proposal: null, error: "Submit-verdict model returned invalid JSON", retryable: true };
    }
    return { proposal, error: "", retryable: false };
  }
}

export class UnconfiguredSubmitVerdictModel implements SubmitVerdictModel {
  readonly name = "unconfigured";
  async judge(_input: SubmitVerdictInput): Promise<SubmitVerdictModelResult> {
    return { proposal: null, error: "Submit-verdict model not configured" };
  }
}

export function createSubmitVerdictModelFromEnv(config: LlmConfig): SubmitVerdictModel {
  if (config.endpoint === undefined || config.apiKey === undefined) {
    return new UnconfiguredSubmitVerdictModel();
  }
  return new AzureFoundrySubmitVerdictModel({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    deployment: config.deployment,
    apiVersion: config.apiVersion,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
}
