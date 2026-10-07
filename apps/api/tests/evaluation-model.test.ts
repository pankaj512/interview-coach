// Feature 21: evaluation model factory selection across providers.
// The keyed-model request path is proven in llm-transport.test.ts and the
// recommendation factory test; here the factory's selection rules are pinned.

import { describe, expect, it } from "vitest";
import type { EvaluationModelInput } from "@interview-coach/core";
import {
  AzureFoundryEvaluationModel,
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
