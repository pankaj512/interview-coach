// Feature 21: evaluation model factory selection across providers.
// The keyed-model request path is proven in llm-transport.test.ts and the
// recommendation factory test; here the factory's selection rules are pinned.

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { EvaluationModelInput } from "@interview-coach/core";
import {
  AzureFoundryEvaluationModel,
  buildEvaluationMessages,
  createEvaluationModelFromEnv,
  UnconfiguredEvaluationModel,
} from "../src/evaluation-model.js";

// The unconfigured model ignores its input; nothing here exercises a live LLM.
const IGNORED_INPUT = undefined as unknown as EvaluationModelInput;

function baseConfig(overrides: Record<string, string | undefined>): Parameters<typeof createEvaluationModelFromEnv>[0] {
  return {
    endpoint: undefined,
    apiKey: undefined,
    deployment: "d",
    apiVersion: "v",
    provider: "azure",
    baseUrl: "",
    model: "",
    timeoutMs: 1000,
    maxRetries: 1,
    ...overrides,
  };
}

describe("evaluation model factory", () => {
  it("returns the unconfigured model without endpoint/key", async () => {
    const model = createEvaluationModelFromEnv(baseConfig({}));
    expect(model).toBeInstanceOf(UnconfiguredEvaluationModel);
    const result = await model.evaluate(IGNORED_INPUT);
    expect(result.proposal).toBeNull();
  });

  it("returns the keyed model for azure when configured", () => {
    const model = createEvaluationModelFromEnv(
      baseConfig({ endpoint: "https://foundry.example", apiKey: "k" }),
    );
    expect(model).toBeInstanceOf(AzureFoundryEvaluationModel);
  });

  it("returns the keyed model for inception without an endpoint", () => {
    const model = createEvaluationModelFromEnv(
      baseConfig({ apiKey: "k", provider: "inception" }),
    );
    expect(model).toBeInstanceOf(AzureFoundryEvaluationModel);
  });

  it("treats an unknown provider as unconfigured", async () => {
    const model = createEvaluationModelFromEnv(
      baseConfig({ endpoint: "https://foundry.example", apiKey: "k", provider: "bogus" }),
    );
    expect(model).toBeInstanceOf(UnconfiguredEvaluationModel);
    const result = await model.evaluate(IGNORED_INPUT);
    expect(result.proposal).toBeNull();
  });
});

// Migration lock (feature 25): the system message must stay strictly equal to
// the approved 8-line prompt text; any drift in content or line joining fails.
const LOCK_INPUT: EvaluationModelInput = {
  interviewId: "iv_1",
  candidateId: "cand_1",
  status: "completed",
  configuration: { interviewType: "dsa" },
  problem: null,
  topic: null,
  profile: null,
  skillState: null,
  transcript: [],
  responses: [],
  submissions: [],
  runs: [],
  hintsUsed: 0,
};

// Prompt lock: the system message must stay byte-identical to the approved
// file-backed text (SHA-256 pins every byte without embedding the ~300-line
// prompt here); any drift in content or line joining fails.
const EXPECTED_SYSTEM_PROMPT_SHA256 =
  "d68c1aca10f43223bc20a3ac6b86a5a5184acda517a89ef12626ac7817517019";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("evaluation prompt file migration", () => {
  it("keeps the file-backed system prompt byte-identical to the approved text", () => {
    const messages = buildEvaluationMessages(LOCK_INPUT);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toBeDefined();
    expect(sha256Hex(String(messages[0]?.content))).toBe(EXPECTED_SYSTEM_PROMPT_SHA256);
  });
});
