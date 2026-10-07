// Feature 18d server-side submit-verdict model: prompt/parse helpers and the
// Azure Foundry adapter against a fake HTTP transport (no live LLM).

import { describe, expect, it } from "vitest";
import type { SubmitVerdictInput } from "@interview-coach/core";
import {
  AzureFoundrySubmitVerdictModel,
  buildSubmitVerdictMessages,
  createSubmitVerdictModelFromEnv,
  parseSubmitVerdictProposal,
  UnconfiguredSubmitVerdictModel,
} from "../src/submit-verdict-model.js";
import type { LlmFetch } from "../src/recommendation-model.js";

const input: SubmitVerdictInput = {
  interviewId: "iv_1",
  language: "python",
  code: "def solve(nums):\n    return sum(nums)",
  problem: {
    id: "prob_arrays",
    title: "Array Sum",
    statement: "Return the sum.",
    constraints: "1 <= n <= 100",
  },
};

const VALID_CONTENT =
  '{"correctness":"correct","correctnessNotes":"sums all items","optimality":"O(n) time, O(1) space","optimalityNotes":"optimal","breakPoints":[],"edgeCases":["empty list"],"summary":"Clean linear solution."}';

function jsonResponse(status: number, content: string): { status: number; text(): Promise<string> } {
  return {
    status,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  };
}

describe("submit-verdict prompt + parsing", () => {
  it("includes the code and asks for the JSON contract", () => {
    const messages = buildSubmitVerdictMessages(input);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("correctness");
    expect(messages[0]?.content).toContain("breakPoints");
    const user = messages[1]?.content ?? "";
    expect(user).toContain("def solve");
    expect(user).toContain("prob_arrays");
  });

  it("parses fenced/prose-wrapped JSON and rejects malformed content", () => {
    expect(parseSubmitVerdictProposal(`\`\`\`json\n${VALID_CONTENT}\n\`\`\``)).toMatchObject({
      correctness: "correct",
    });
    expect(parseSubmitVerdictProposal(`Sure! ${VALID_CONTENT} hope that helps`)).toMatchObject({
      summary: "Clean linear solution.",
    });
    expect(parseSubmitVerdictProposal("no json here")).toBeNull();
    expect(parseSubmitVerdictProposal('{"correctness":"correct"}')).toBeNull();
  });
});

describe("AzureFoundrySubmitVerdictModel", () => {
  it("returns the parsed verdict on success", async () => {
    const fetchImpl: LlmFetch = async () => jsonResponse(200, VALID_CONTENT);
    const model = new AzureFoundrySubmitVerdictModel({
      endpoint: "https://foundry.example/",
      apiKey: "secret-key",
      deployment: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      fetchImpl,
    });
    const result = await model.judge(input);
    expect(result.proposal).toMatchObject({ correctness: "correct" });
  });

  it("surfaces an error on invalid model JSON", async () => {
    const fetchImpl: LlmFetch = async () => jsonResponse(200, "no json here");
    const model = new AzureFoundrySubmitVerdictModel({
      endpoint: "https://foundry.example/",
      apiKey: "secret-key",
      deployment: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      maxRetries: 0,
      fetchImpl,
    });
    const result = await model.judge(input);
    expect(result.proposal).toBeNull();
    expect(result.error).toContain("invalid JSON");
  });
});

describe("submit-verdict model factory", () => {
  it("returns the unconfigured model without endpoint/key", async () => {
    const model = createSubmitVerdictModelFromEnv({
      endpoint: undefined,
      apiKey: undefined,
      deployment: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      provider: "azure",
      baseUrl: "",
      model: "",
      timeoutMs: 1000,
      maxRetries: 1,
    });
    expect(model).toBeInstanceOf(UnconfiguredSubmitVerdictModel);
    const result = await model.judge(input);
    expect(result.proposal).toBeNull();
  });

  it("returns the keyed model for inception without an endpoint", () => {
    const model = createSubmitVerdictModelFromEnv({
      endpoint: undefined,
      apiKey: "k",
      deployment: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      provider: "inception",
      baseUrl: "",
      model: "",
      timeoutMs: 1000,
      maxRetries: 1,
    });
    expect(model).toBeInstanceOf(AzureFoundrySubmitVerdictModel);
  });

  it("treats an unknown provider as unconfigured", async () => {
    const model = createSubmitVerdictModelFromEnv({
      endpoint: "https://foundry.example",
      apiKey: "k",
      deployment: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      provider: "bogus",
      baseUrl: "",
      model: "",
      timeoutMs: 1000,
      maxRetries: 1,
    });
    expect(model).toBeInstanceOf(UnconfiguredSubmitVerdictModel);
    const result = await model.judge(input);
    expect(result.proposal).toBeNull();
  });
});
