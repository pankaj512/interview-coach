// @interview-coach/api - server-side submit-verdict model.
//
// Owns: the advisory LLM surface proposing structured Submit verdicts from
// problem context plus editor code; the service validates. Surprising: no
// deterministic fallback (failures are data, surfaced as errors, never
// invented verdicts).
//
// History: 18d; see docs/SESSION_HANDOFF.md.

import {
  validateSubmitVerdictInput,
  validateSubmitVerdictProposal,
  type SubmitVerdict,
  type SubmitVerdictInput,
  type SubmitVerdictModel,
  type SubmitVerdictModelResult,
} from "@interview-coach/core";
import type { LlmConfig } from "./config.js";
import {
  buildChatRequest,
  defaultFetch,
  extractChatContent,
  extractFirstJsonObject,
  isProviderConfigured,
  postChatCompletions,
  resolveLlmProvider,
  type ChatMessage,
  type LlmFetch,
  type LlmProviderName,
} from "./llm-transport.js";

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
  const json = extractFirstJsonObject(content);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
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
  readonly provider?: LlmProviderName;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly fetchImpl?: LlmFetch;
}

export class AzureFoundrySubmitVerdictModel implements SubmitVerdictModel {
  readonly name = "azure-foundry";
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly apiVersion: string;
  private readonly provider: LlmProviderName;
  private readonly baseUrl: string | undefined;
  private readonly model: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: LlmFetch;

  constructor(deps: AzureFoundrySubmitVerdictModelDeps) {
    this.endpoint = deps.endpoint;
    this.apiKey = deps.apiKey;
    this.deployment = deps.deployment;
    this.apiVersion = deps.apiVersion;
    this.provider = deps.provider ?? "azure";
    this.baseUrl = deps.baseUrl;
    this.model = deps.model;
    this.timeoutMs = deps.timeoutMs ?? 20_000;
    this.maxRetries = deps.maxRetries ?? 2;
    this.fetchFn = deps.fetchImpl ?? defaultFetch("submit-verdict");
  }

  async judge(input: SubmitVerdictInput): Promise<SubmitVerdictModelResult> {
    const checked = validateSubmitVerdictInput(input);
    if (checked === null) {
      return { proposal: null, error: "Invalid submit-verdict input" };
    }
    const request = buildChatRequest({
      provider: this.provider,
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      deployment: this.deployment,
      apiVersion: this.apiVersion,
      baseUrl: this.baseUrl,
      model: this.model,
      messages: buildSubmitVerdictMessages(checked),
    });
    const outcome = await postChatCompletions(request.url, request.headers, request.body, {
      fetchImpl: this.fetchFn,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      errorPrefix: "Submit-verdict model",
    });
    if (outcome.raw === null) return { proposal: null, error: outcome.error };
    const content = extractChatContent(outcome.raw);
    if (content === null) {
      return { proposal: null, error: "Submit-verdict model returned no content" };
    }
    const proposal = parseSubmitVerdictProposal(content);
    if (proposal === null) {
      return { proposal: null, error: "Submit-verdict model returned invalid JSON" };
    }
    return { proposal };
  }
}

export class UnconfiguredSubmitVerdictModel implements SubmitVerdictModel {
  readonly name = "unconfigured";
  async judge(_input: SubmitVerdictInput): Promise<SubmitVerdictModelResult> {
    return { proposal: null, error: "Submit-verdict model not configured" };
  }
}

export function createSubmitVerdictModelFromEnv(config: LlmConfig): SubmitVerdictModel {
  const provider = resolveLlmProvider(config.provider);
  if (!isProviderConfigured(provider, config)) {
    return new UnconfiguredSubmitVerdictModel();
  }
  return new AzureFoundrySubmitVerdictModel({
    endpoint: config.endpoint ?? "",
    apiKey: config.apiKey ?? "",
    deployment: config.deployment,
    apiVersion: config.apiVersion,
    provider: provider ?? "azure",
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
}
