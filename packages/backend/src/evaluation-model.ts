// @interview-coach/backend — server-side evaluation model (Phase 10).
//
// The third LLM surface (ADR-002): server-side only, never a realtime tool.
// It reads the assembled interview context (transcript, code, runs, topic,
// skill) and proposes a structured evaluation. The model is advisory: the
// service validates the proposal against the domain contract and falls back
// deterministically on any failure, so an interview is never lost.
//
// Failures are data, not exceptions: timeout/HTTP/unparseable/invalid all
// yield `{ proposal: null, error }`.

import {
  validateEvaluationProposal,
  type EvaluationModel,
  type EvaluationModelInput,
  type EvaluationModelResult,
  type EvaluationProposal,
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
    throw new Error("No fetch implementation available for the evaluation model");
  }
  const fn = impl as (
    input: string,
    init: Record<string, unknown>,
  ) => Promise<{ status: number; text(): Promise<string> }>;
  return (input, init) => fn(input, init);
}

const SYSTEM_PROMPT = [
  "You are the evaluation engine for a DSA interview-practice coach.",
  "Judge the candidate's performance from the provided transcript, responses, code, and run results.",
  "Score ONLY these dimensions, each 0-5, and include a short evidence note per dimension:",
  "problem_understanding, approach, communication, coding, testing_debugging, complexity_analysis, independence.",
  "Omit a dimension you have no evidence for; never invent code or runs.",
  "Independence reflects how much the candidate needed hints (more hints -> lower).",
  "Reply with ONLY a JSON object, no prose and no markdown, shaped exactly as:",
  '{"dimensions": {"<dimension>": {"score": <0-5>, "notes": "<evidence>"}}, "strengths": ["..."], "weaknesses": ["..."]}',
].join("\n");

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
  return validateEvaluationProposal(parsed);
}

export interface AzureFoundryEvaluationModelDeps {
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

export class AzureFoundryEvaluationModel implements EvaluationModel {
  readonly name = "azure-foundry";
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: LlmFetch;

  constructor(deps: AzureFoundryEvaluationModelDeps) {
    this.endpoint = deps.endpoint;
    this.apiKey = deps.apiKey;
    this.deployment = deps.deployment;
    this.apiVersion = deps.apiVersion;
    this.timeoutMs = deps.timeoutMs ?? 20_000;
    this.maxRetries = deps.maxRetries ?? 2;
    this.fetchFn = deps.fetchImpl ?? defaultFetch();
  }

  async evaluate(input: EvaluationModelInput): Promise<EvaluationModelResult> {
    const url = joinUrl(
      this.endpoint,
      `/openai/deployments/${encodeURIComponent(this.deployment)}/chat/completions?api-version=${encodeURIComponent(this.apiVersion)}`,
    );
    const body = JSON.stringify({
      messages: buildEvaluationMessages(input),
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    let lastError = "Evaluation model unavailable";
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
    | { proposal: EvaluationProposal; error: ""; retryable: false }
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
            ? "Evaluation model timed out"
            : "Evaluation model request failed",
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
    if (status < 200 || status >= 300) {
      return {
        proposal: null,
        error: `Evaluation model returned HTTP ${status}`,
        retryable: status === 429 || status >= 500,
      };
    }
    const content = extractChatContent(text);
    if (content === null) {
      return { proposal: null, error: "Evaluation model returned no content", retryable: true };
    }
    const proposal = parseEvaluationProposal(content);
    if (proposal === null) {
      return { proposal: null, error: "Evaluation model returned invalid JSON", retryable: true };
    }
    return { proposal, error: "", retryable: false };
  }
}

export class UnconfiguredEvaluationModel implements EvaluationModel {
  readonly name = "unconfigured";
  async evaluate(_input: EvaluationModelInput): Promise<EvaluationModelResult> {
    return { proposal: null, error: "Evaluation model not configured" };
  }
}

export function createEvaluationModelFromEnv(config: LlmConfig): EvaluationModel {
  if (config.endpoint === undefined || config.apiKey === undefined) {
    return new UnconfiguredEvaluationModel();
  }
  return new AzureFoundryEvaluationModel({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    deployment: config.deployment,
    apiVersion: config.apiVersion,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
}
