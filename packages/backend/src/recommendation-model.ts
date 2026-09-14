// @interview-coach/backend — server-side recommendation model (Phase 4).
//
// Implements the domain `RecommendationModel` port against an Azure AI Foundry
// (Azure OpenAI-compatible) chat-completions deployment. This is the *second*
// LLM surface (ADR-002): separate from Azure Voice Live, server-side only, and
// never a realtime tool. The model is advisory — it may only pick a
// (topicId, problemId) pair from the backend-built candidate set; the service
// validates and persists the result.
//
// Failures are data, not exceptions: a timeout, HTTP error, or unparseable
// body yields `{ proposal: null, error }`, so `RecommendationService` falls
// back deterministically. No credential ever leaves this process.

import type {
  RecommendationModel,
  RecommendationModelInput,
  RecommendationModelResult,
  RecommendationProposal,
} from "@interview-coach/domain";
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

function defaultFetch(): LlmFetch {
  const impl = (globalThis as { fetch?: unknown })["fetch"];
  if (typeof impl !== "function") {
    throw new Error("No fetch implementation available for the recommendation model");
  }
  const fn = impl as (
    input: string,
    init: Record<string, unknown>,
  ) => Promise<{ status: number; text(): Promise<string> }>;
  return (input, init) => fn(input, init);
}

export interface ChatMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

const SYSTEM_PROMPT = [
  "You are the recommendation engine for an interview-practice coach.",
  "Choose the single best next practice problem for the candidate from the CANDIDATE SET.",
  "You MUST choose a (topicId, problemId) pair that appears in the candidate set; never invent or modify IDs.",
  "Prefer reinforcing weaknesses and continuing the current topic over jumping ahead.",
  "Reply with ONLY a JSON object, no prose and no markdown, shaped exactly as:",
  '{"recommendationType": "<type>", "topicId": "<topicId>", "problemId": "<problemId>", "reason": "<1-2 sentences, second person>"}',
  "recommendationType must be one of: new_topic, continue_topic, reinforce_weakness, review_topic, advance_topic.",
].join("\n");

// Deterministic prompt assembly (pure, unit-tested). The candidate set is the
// closed menu; profile/skill/progress are context, never instructions.
export function buildRecommendationMessages(
  input: RecommendationModelInput,
): readonly ChatMessage[] {
  const candidates = input.candidateSet.candidates.map((candidate) => ({
    recommendationType: candidate.recommendationType,
    topicId: candidate.topicId,
    problemId: candidate.problemId,
    topic: candidate.topicName,
    problem: candidate.problemTitle,
    difficulty: candidate.difficulty,
  }));
  const context = {
    curriculumId: input.candidateSet.curriculumId,
    profile:
      input.profile === null
        ? null
        : {
            interviewTypes: input.profile.interviewTypes,
            role: input.profile.role,
            level: input.profile.level,
            ...(input.profile.goals === undefined ? {} : { goals: input.profile.goals }),
          },
    currentTopicId: input.progress?.currentTopicId ?? null,
    skills: input.skills.map((skill) => ({
      topicId: skill.topicId,
      masteryLevel: skill.masteryLevel,
      successfulAttempts: skill.successfulAttempts,
      totalAttempts: skill.totalAttempts,
      lastOutcome: skill.lastOutcome ?? null,
      weaknesses: skill.weaknesses,
    })),
    candidateSet: candidates,
  };
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(context) },
  ];
}

// Robustly extracts the first JSON object from model text: tolerates markdown
// fences and surrounding prose, then checks the four required string fields.
export function parseRecommendationProposal(content: string): RecommendationProposal | null {
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
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const { recommendationType, topicId, problemId, reason } = record;
  if (
    typeof recommendationType !== "string" ||
    typeof topicId !== "string" ||
    typeof problemId !== "string" ||
    typeof reason !== "string"
  ) {
    return null;
  }
  return { recommendationType, topicId, problemId, reason };
}

export interface AzureFoundryRecommendationModelDeps {
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

export class AzureFoundryRecommendationModel implements RecommendationModel {
  readonly name = "azure-foundry";
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: LlmFetch;

  constructor(deps: AzureFoundryRecommendationModelDeps) {
    this.endpoint = deps.endpoint;
    this.apiKey = deps.apiKey;
    this.deployment = deps.deployment;
    this.apiVersion = deps.apiVersion;
    this.timeoutMs = deps.timeoutMs ?? 10_000;
    this.maxRetries = deps.maxRetries ?? 2;
    this.fetchFn = deps.fetchImpl ?? defaultFetch();
  }

  async recommend(input: RecommendationModelInput): Promise<RecommendationModelResult> {
    const url = joinUrl(
      this.endpoint,
      `/openai/deployments/${encodeURIComponent(this.deployment)}/chat/completions?api-version=${encodeURIComponent(this.apiVersion)}`,
    );
    const body = JSON.stringify({
      messages: buildRecommendationMessages(input),
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    let lastError = "Recommendation model unavailable";
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const outcome = await this.attempt(url, body);
      if (outcome.proposal !== null) return { proposal: outcome.proposal };
      lastError = outcome.error;
      // 4xx (bad request/auth) is permanent: retrying cannot help.
      if (!outcome.retryable) return { proposal: null, error: lastError };
    }
    return { proposal: null, error: lastError };
  }

  private async attempt(
    url: string,
    body: string,
  ): Promise<
    | { proposal: RecommendationProposal; error: ""; retryable: false }
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
        error: error instanceof Error && error.name === "AbortError"
          ? "Recommendation model timed out"
          : "Recommendation model request failed",
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
    if (status < 200 || status >= 300) {
      return {
        proposal: null,
        error: `Recommendation model returned HTTP ${status}`,
        retryable: status === 429 || status >= 500,
      };
    }
    const content = extractChatContent(text);
    if (content === null) {
      return { proposal: null, error: "Recommendation model returned no content", retryable: true };
    }
    const proposal = parseRecommendationProposal(content);
    if (proposal === null) {
      return { proposal: null, error: "Recommendation model returned invalid JSON", retryable: true };
    }
    return { proposal, error: "", retryable: false };
  }
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

// No endpoint/key configured: the service falls back deterministically. This
// keeps the learning loop fully functional without a server-side LLM.
export class UnconfiguredRecommendationModel implements RecommendationModel {
  readonly name = "unconfigured";
  async recommend(_input: RecommendationModelInput): Promise<RecommendationModelResult> {
    return { proposal: null, error: "Recommendation model not configured" };
  }
}

export function createRecommendationModelFromEnv(config: LlmConfig): RecommendationModel {
  if (config.endpoint === undefined || config.apiKey === undefined) {
    return new UnconfiguredRecommendationModel();
  }
  return new AzureFoundryRecommendationModel({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    deployment: config.deployment,
    apiVersion: config.apiVersion,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
}
