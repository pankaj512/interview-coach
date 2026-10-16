// @interview-coach/api - server-side evaluation model.
//
// Owns: the advisory LLM surface proposing structured evaluations,
// validated with deterministic fallback so no interview is lost.
// Surprising: failures are data, not exceptions - every failure mode
// yields `{ proposal: null, error }`.
//
// History: Phase 10; see docs/SESSION_HANDOFF.md.

import {
  validateEvaluationProposal,
  type EvaluationModel,
  type EvaluationModelInput,
  type EvaluationModelResult,
  type EvaluationProposal,
} from "@interview-coach/core";
import type { LlmConfig } from "./config.js";
import { loadPromptSet } from "./prompts/loader.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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

// System prompt is file-owned (prompts/evaluation/): loaded once at
// module scope so a broken prompt file fails fast at boot.
const EVALUATION_PROMPT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "prompts",
  "evaluation",
);

function loadEvaluationSystemPrompt(): string {
  const prompt = loadPromptSet(EVALUATION_PROMPT_DIR, {})["evaluation-system"];
  if (prompt === undefined) {
    throw new Error(`Prompt "evaluation-system" missing from ${EVALUATION_PROMPT_DIR}`);
  }
  return prompt;
}

const SYSTEM_PROMPT = loadEvaluationSystemPrompt();

// Deterministic prompt assembly (pure, unit-tested).
export function buildEvaluationMessages(input: EvaluationModelInput): readonly ChatMessage[] {
  const context = {
    interviewId: input.interviewId,
    status: input.status,
    configuration: input.configuration,
    problem:
      input.problem === null
        ? null
        : {
            id: input.problem.id,
            title: input.problem.title,
            difficulty: input.problem.difficulty,
            expectedConcepts: input.problem.expectedConcepts ?? [],
          },
    topic: input.topic,
    profile:
      input.profile === null
        ? null
        : { role: input.profile.role, level: input.profile.level, goals: input.profile.goals ?? null },
    skillState:
      input.skillState === null
        ? null
        : {
            masteryLevel: input.skillState.masteryLevel,
            successfulAttempts: input.skillState.successfulAttempts,
            totalAttempts: input.skillState.totalAttempts,
            weaknesses: input.skillState.weaknesses,
          },
    hintsUsed: input.hintsUsed,
    transcript: input.transcript,
    responses: input.responses,
    submissions: input.submissions,
    runs: input.runs,
  };
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(context) },
  ];
}

// Pulls the first JSON object out of model text (tolerates fences/prose), then
// validates it against the domain proposal contract.
export function parseEvaluationProposal(content: string): EvaluationProposal | null {
  const json = extractFirstJsonObject(content);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  return validateEvaluationProposal(parsed);
}

export interface AzureFoundryEvaluationModelDeps {
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

export class AzureFoundryEvaluationModel implements EvaluationModel {
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

  constructor(deps: AzureFoundryEvaluationModelDeps) {
    this.endpoint = deps.endpoint;
    this.apiKey = deps.apiKey;
    this.deployment = deps.deployment;
    this.apiVersion = deps.apiVersion;
    this.provider = deps.provider ?? "azure";
    this.baseUrl = deps.baseUrl;
    this.model = deps.model;
    this.timeoutMs = deps.timeoutMs ?? 20_000;
    this.maxRetries = deps.maxRetries ?? 2;
    this.fetchFn = deps.fetchImpl ?? defaultFetch("evaluation");
  }

  async evaluate(input: EvaluationModelInput): Promise<EvaluationModelResult> {
    const request = buildChatRequest({
      provider: this.provider,
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      deployment: this.deployment,
      apiVersion: this.apiVersion,
      baseUrl: this.baseUrl,
      model: this.model,
      messages: buildEvaluationMessages(input),
    });
    const outcome = await postChatCompletions(request.url, request.headers, request.body, {
      fetchImpl: this.fetchFn,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      errorPrefix: "Evaluation model",
    });
    if (outcome.raw === null) return { proposal: null, error: outcome.error };
    const content = extractChatContent(outcome.raw);
    if (content === null) {
      return { proposal: null, error: "Evaluation model returned no content" };
    }
    const proposal = parseEvaluationProposal(content);
    if (proposal === null) {
      return { proposal: null, error: "Evaluation model returned invalid JSON" };
    }
    return { proposal };
  }
}

export class UnconfiguredEvaluationModel implements EvaluationModel {
  readonly name = "unconfigured";
  async evaluate(_input: EvaluationModelInput): Promise<EvaluationModelResult> {
    return { proposal: null, error: "Evaluation model not configured" };
  }
}

export function createEvaluationModelFromEnv(config: LlmConfig): EvaluationModel {
  const provider = resolveLlmProvider(config.provider);
  if (!isProviderConfigured(provider, config)) {
    return new UnconfiguredEvaluationModel();
  }
  return new AzureFoundryEvaluationModel({
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
