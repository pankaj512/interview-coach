// Phase 10: async evaluation service. `end` completes immediately and runs a
// durable job; the server-side model proposes, the backend validates, and an
// unavailable/invalid model falls back deterministically.

import { afterEach, describe, expect, it } from "vitest";
import {
  asInterviewId,
  InterviewService,
  type EvaluationModel,
  type EvaluationModelInput,
  type EvaluationModelResult,
} from "@interview-coach/core";
import { buildTestBackend, createStartedInterview, seedProblem, type TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

class FakeEvaluationModel implements EvaluationModel {
  readonly name = "fake";
  lastInput: EvaluationModelInput | null = null;
  constructor(private readonly behavior: (input: EvaluationModelInput) => EvaluationModelResult) {}
  async evaluate(input: EvaluationModelInput): Promise<EvaluationModelResult> {
    this.lastInput = input;
    return this.behavior(input);
  }
}

async function getEvaluation(b: TestBackend, id: string) {
  return b.app.inject({ method: "GET", url: `/api/interviews/${id}/evaluation` });
}

describe("phase 10 evaluation", () => {
  it("end completes immediately and the fallback evaluation is persisted", async () => {
    backend = buildTestBackend();
    const tb = backend;
    await seedProblem(tb.repos);
    const { id } = await createStartedInterview(tb, ["prob_two-sum"]);
    const ended = await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    expect(ended.statusCode).toBe(200);
    expect((ended.json() as { interview: { status: string } }).interview.status).toBe("completed");

    const res = await getEvaluation(tb, id);
    expect(res.statusCode).toBe(200);
    const evaluation = (res.json() as { evaluation: Record<string, unknown> }).evaluation;
    expect(evaluation).toMatchObject({ status: "completed", source: "fallback" });
    expect(Object.keys(evaluation["dimensions"] as object).length).toBeGreaterThan(0);
    expect(typeof evaluation["overallScore"]).toBe("number");

    const state = await tb.app.inject({ method: "GET", url: `/api/interviews/${id}/state` });
    expect(
      (state.json() as { state: { interview: { evaluationStatus: string } } }).state.interview.evaluationStatus,
    ).toBe("completed");
  });

  it("uses a valid LLM proposal (source: llm) and validates it", async () => {
    const model = new FakeEvaluationModel(() => ({
      proposal: {
        dimensions: { coding: { score: 5, notes: "clean" }, independence: { score: 4 } },
        strengths: ["Correct and independent"],
        weaknesses: ["Could add edge cases"],
      },
    }));
    backend = buildTestBackend({ evaluationModel: model });
    const tb = backend;
    await seedProblem(tb.repos);
    const { id } = await createStartedInterview(tb, ["prob_two-sum"]);
    await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });

    const evaluation = (await getEvaluation(tb, id)).json() as {
      evaluation: { source: string; overallScore: number; strengths: string[] };
    };
    expect(evaluation.evaluation.source).toBe("llm");
    // Mean of 5 and 4 = 4.5/5 -> 90.
    expect(evaluation.evaluation.overallScore).toBe(90);
    expect(evaluation.evaluation.strengths).toEqual(["Correct and independent"]);
    expect(model.lastInput?.interviewId).toBe(id);
  });

  it("falls back when the model returns an invalid proposal", async () => {
    const model = new FakeEvaluationModel(() => ({
      proposal: { dimensions: { telepathy: { score: 5 } } as never, strengths: [], weaknesses: [] },
    }));
    backend = buildTestBackend({ evaluationModel: model });
    const tb = backend;
    await seedProblem(tb.repos);
    const { id } = await createStartedInterview(tb, ["prob_two-sum"]);
    await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    const evaluation = (await getEvaluation(tb, id)).json() as { evaluation: { source: string } };
    expect(evaluation.evaluation.source).toBe("fallback");
  });

  it("falls back when the model throws, without losing the interview", async () => {
    const model: EvaluationModel = {
      name: "throwing",
      async evaluate() {
        throw new Error("boom");
      },
    };
    backend = buildTestBackend({ evaluationModel: model });
    const tb = backend;
    await seedProblem(tb.repos);
    const { id } = await createStartedInterview(tb, ["prob_two-sum"]);
    await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    const evaluation = (await getEvaluation(tb, id)).json() as { evaluation: { source: string } };
    expect(evaluation.evaluation.source).toBe("fallback");
    const state = await tb.app.inject({ method: "GET", url: `/api/interviews/${id}/state` });
    expect(
      (state.json() as { state: { interview: { status: string; evaluationStatus: string } } }).state.interview,
    ).toMatchObject({ status: "completed", evaluationStatus: "completed" });
  });

  it("heavy hints lower independence and downgrade the recommendation", async () => {
    backend = buildTestBackend();
    const tb = backend;
    await seedProblem(tb.repos);
    const { id } = await createStartedInterview(tb, ["prob_two-sum"]);
    // The hint tool is retired; hint accounting is recorded at the domain
    // level to preserve the evaluation-pipeline downgrade coverage.
    const interviews = new InterviewService({ ...tb.repos, clock: { now: () => new Date() } });
    for (const n of [1, 2, 3]) {
      const recorded = await interviews.recordHint(asInterviewId(id), n);
      expect(recorded.ok).toBe(true);
    }
    await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    const evaluation = (await getEvaluation(tb, id)).json() as {
      evaluation: { hintsUsed: number; dimensions: Record<string, { score: number }>; recommendation: string };
    };
    expect(evaluation.evaluation.hintsUsed).toBe(3);
    expect(evaluation.evaluation.dimensions["independence"]?.score).toBe(2);
    // Independence 2 drags the mean down; with a downgrade this is no_hire.
    expect(evaluation.evaluation.recommendation).toBe("no_hire");
  });

  it("is idempotent: re-ending does not create a second evaluation", async () => {
    backend = buildTestBackend();
    const tb = backend;
    await seedProblem(tb.repos);
    const { id } = await createStartedInterview(tb, ["prob_two-sum"]);
    await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    const first = (await getEvaluation(tb, id)).json() as { evaluation: { id: string } };
    await tb.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    const second = (await getEvaluation(tb, id)).json() as { evaluation: { id: string } };
    expect(second.evaluation.id).toBe(first.evaluation.id);
  });

  it("404s the evaluation of an unknown interview", async () => {
    backend = buildTestBackend();
    const res = await getEvaluation(backend, "iv_missing");
    expect(res.statusCode).toBe(404);
  });
});
