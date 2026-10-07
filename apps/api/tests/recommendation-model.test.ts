// Phase 4 server-side recommendation model: prompt/parse helpers and the
// Azure Foundry adapter against a fake HTTP transport (no live LLM).

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asCurriculumId,
  asProblemId,
  asTopicId,
  type RecommendationModelInput,
} from "@interview-coach/core";
import {
  AzureFoundryRecommendationModel,
  buildRecommendationMessages,
  extractChatContent,
  parseRecommendationProposal,
  UnconfiguredRecommendationModel,
  createRecommendationModelFromEnv,
  type LlmFetch,
} from "../src/recommendation-model.js";

const input: RecommendationModelInput = {
  profile: null,
  candidateSet: {
    curriculumId: asCurriculumId("dsa"),
    candidates: [
      {
        recommendationType: "new_topic",
        topicId: asTopicId("topic_arrays"),
        topicName: "Arrays",
        problemId: asProblemId("prob_two-sum"),
        problemTitle: "Two Sum",
        difficulty: "Easy",
        reason: "Start here",
      },
    ],
  },
  skills: [],
  progress: null,
};

const VALID_CONTENT =
  '{"recommendationType":"new_topic","topicId":"topic_arrays","problemId":"prob_two-sum","reason":"Start with Two Sum."}';

function jsonResponse(status: number, content: string): { status: number; text(): Promise<string> } {
  return {
    status,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  };
}

describe("recommendation prompt + parsing", () => {
  it("includes the candidate menu and asks for the JSON contract", () => {
    const messages = buildRecommendationMessages(input);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("recommendationType");
    const user = messages[1]?.content ?? "";
    expect(user).toContain("prob_two-sum");
    expect(user).toContain("topic_arrays");
  });

  it("parses fenced/prose-wrapped JSON and rejects malformed content", () => {
    expect(parseRecommendationProposal(`\`\`\`json\n${VALID_CONTENT}\n\`\`\``)).toMatchObject({
      problemId: "prob_two-sum",
    });
    expect(parseRecommendationProposal(`Sure! ${VALID_CONTENT} hope that helps`)).toMatchObject({
      topicId: "topic_arrays",
    });
    expect(parseRecommendationProposal("no json here")).toBeNull();
    expect(parseRecommendationProposal('{"recommendationType":"new_topic"}')).toBeNull();
    expect(extractChatContent("not json")).toBeNull();
  });
});

describe("AzureFoundryRecommendationModel", () => {
  it("returns the parsed proposal on success", async () => {
    const fetchImpl: LlmFetch = async () => jsonResponse(200, VALID_CONTENT);
    const model = new AzureFoundryRecommendationModel({
      endpoint: "https://foundry.example/",
      apiKey: "secret-key",
      deployment: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      fetchImpl,
    });
    const result = await model.recommend(input);
    expect(result.proposal).toMatchObject({ problemId: "prob_two-sum" });
  });

  it("retries a 5xx then succeeds", async () => {
    let calls = 0;
    const fetchImpl: LlmFetch = async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(500, "boom") : jsonResponse(200, VALID_CONTENT);
    };
    const model = new AzureFoundryRecommendationModel({
      endpoint: "https://foundry.example",
      apiKey: "k",
      deployment: "d",
      apiVersion: "v",
      maxRetries: 2,
      fetchImpl,
    });
    const result = await model.recommend(input);
    expect(result.proposal).not.toBeNull();
    expect(calls).toBe(2);
  });

  it("does not retry a 4xx and reports the failure", async () => {
    let calls = 0;
    const fetchImpl: LlmFetch = async () => {
      calls += 1;
      return jsonResponse(400, "bad request");
    };
    const model = new AzureFoundryRecommendationModel({
      endpoint: "https://foundry.example",
      apiKey: "k",
      deployment: "d",
      apiVersion: "v",
      maxRetries: 2,
      fetchImpl,
    });
    const result = await model.recommend(input);
    expect(result.proposal).toBeNull();
    expect(result.error).toContain("400");
    expect(calls).toBe(1);
  });

  it("treats an aborted request as a retryable failure", async () => {
    const fetchImpl: LlmFetch = async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    };
    const model = new AzureFoundryRecommendationModel({
      endpoint: "https://foundry.example",
      apiKey: "k",
      deployment: "d",
      apiVersion: "v",
      maxRetries: 0,
      fetchImpl,
    });
    const result = await model.recommend(input);
    expect(result.proposal).toBeNull();
    expect(result.error).toContain("timed out");
  });
});

describe("model selection", () => {
  it("uses the deterministic-fallback model when unconfigured", async () => {
    const model = createRecommendationModelFromEnv({
      endpoint: undefined,
      apiKey: undefined,
      deployment: "d",
      apiVersion: "v",
      provider: "azure",
      baseUrl: "",
      model: "",
      timeoutMs: 1000,
      maxRetries: 1,
    });
    expect(model).toBeInstanceOf(UnconfiguredRecommendationModel);
    const result = await model.recommend(input);
    expect(result.proposal).toBeNull();
  });

  it("uses the Azure adapter when configured", () => {
    const model = createRecommendationModelFromEnv({
      endpoint: "https://foundry.example",
      apiKey: "k",
      deployment: "d",
      apiVersion: "v",
      provider: "azure",
      baseUrl: "",
      model: "",
      timeoutMs: 1000,
      maxRetries: 1,
    });
    expect(model).toBeInstanceOf(AzureFoundryRecommendationModel);
  });

  it("uses the keyed model for inception without an endpoint", () => {
    const model = createRecommendationModelFromEnv({
      endpoint: undefined,
      apiKey: "k",
      deployment: "d",
      apiVersion: "v",
      provider: "inception",
      baseUrl: "",
      model: "",
      timeoutMs: 1000,
      maxRetries: 1,
    });
    expect(model).toBeInstanceOf(AzureFoundryRecommendationModel);
  });

  it("treats an unknown provider as unconfigured", async () => {
    const model = createRecommendationModelFromEnv({
      endpoint: "https://foundry.example",
      apiKey: "k",
      deployment: "d",
      apiVersion: "v",
      provider: "bogus",
      baseUrl: "",
      model: "",
      timeoutMs: 1000,
      maxRetries: 1,
    });
    expect(model).toBeInstanceOf(UnconfiguredRecommendationModel);
    const result = await model.recommend(input);
    expect(result.proposal).toBeNull();
  });

  it("sends the Mercury request for inception with a stubbed fetch", async () => {
    const calls: Array<{ input: string; init: { headers: Record<string, string>; body: string } }> = [];
    vi.stubGlobal("fetch", async (input: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ input, init });
      return jsonResponse(200, VALID_CONTENT);
    });
    try {
      const model = createRecommendationModelFromEnv({
        endpoint: undefined,
        apiKey: "k",
        deployment: "d",
        apiVersion: "v",
        provider: "inception",
        baseUrl: "https://proxy.example/v1",
        model: "mercury-test",
        timeoutMs: 1000,
        maxRetries: 0,
      });
      const result = await model.recommend(input);
      expect(result.proposal).toMatchObject({ problemId: "prob_two-sum" });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.input).toBe("https://proxy.example/v1/chat/completions");
      expect(calls[0]?.init.headers["authorization"]).toBe("Bearer k");
      const body = JSON.parse(calls[0]?.init.body ?? "{}") as Record<string, unknown>;
      expect(body["model"]).toBe("mercury-test");
      expect(body["temperature"]).toBeGreaterThanOrEqual(0.5);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
