// Feature 18d: POST /api/interviews/:id/submit-verdict - AI-only Submit.
// No sandbox run, zero persistence; failures surface errors.

import { afterEach, describe, expect, it } from "vitest";
import {
  asInterviewId,
  asProblemId,
  type SubmitVerdict,
  type SubmitVerdictInput,
  type SubmitVerdictModel,
} from "@interview-coach/domain";
import {
  buildTestBackend,
  createStartedInterview,
  seedProblem,
  type TestBackend,
} from "./helpers.js";
import { UnconfiguredSubmitVerdictModel } from "../src/submit-verdict-model.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

const VERDICT: SubmitVerdict = {
  correctness: "correct",
  correctnessNotes: "Handles all cases.",
  optimality: "O(n) time, O(1) space",
  optimalityNotes: "Single pass.",
  breakPoints: [],
  edgeCases: ["Empty input"],
  summary: "Correct and optimal.",
};

function useBackendWithFake(
  seen: SubmitVerdictInput[],
  verdict: SubmitVerdict | null = VERDICT,
): TestBackend {
  const model: SubmitVerdictModel = {
    name: "fake-verdict",
    judge: async (input: SubmitVerdictInput) => {
      seen.push(input);
      return verdict === null ? { proposal: null, error: "no verdict" } : { proposal: verdict };
    },
  };
  backend = buildTestBackend({ submitVerdictModel: model });
  return backend;
}

describe("POST /api/interviews/:id/submit-verdict", () => {
  it("returns the validated verdict and stores one run-less submission", async () => {
    const seen: SubmitVerdictInput[] = [];
    const b = useBackendWithFake(seen);
    await seedProblem(b.repos);
    const { id } = await createStartedInterview(b, ["prob_two-sum"]);

    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/submit-verdict`,
      payload: { language: "python", code: "def two_sum():\n    pass\n" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, verdict: VERDICT });
    // seedProblem carries no description/constraints, so the model judges
    // code alone.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.problem).toBeNull();
    // The code persists as evidence for the evaluation reader, but no
    // sandbox run is created.
    const submissions = await b.app.inject({
      method: "GET",
      url: `/api/interviews/${id}/submissions`,
    });
    const rows = (submissions.json() as { submissions: unknown[] }).submissions;
    expect(rows).toHaveLength(1);
    const runs = await b.repos.runs.listByInterview(asInterviewId(id));
    expect(runs).toEqual([]);
  });

  it("rejects empty code with 400", async () => {
    const seen: SubmitVerdictInput[] = [];
    const b = useBackendWithFake(seen);
    await seedProblem(b.repos);
    const { id } = await createStartedInterview(b, ["prob_two-sum"]);
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/submit-verdict`,
      payload: { language: "python", code: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(seen).toHaveLength(0);
  });

  it("returns 404 for a missing interview", async () => {
    const seen: SubmitVerdictInput[] = [];
    const b = useBackendWithFake(seen);
    const res = await b.app.inject({
      method: "POST",
      url: "/api/interviews/iv_missing/submit-verdict",
      payload: { language: "python", code: "x = 1\n" },
    });
    expect(res.statusCode).toBe(404);
    expect(seen).toHaveLength(0);
  });

  it("surfaces model failure as 502, never an invented verdict", async () => {
    const seen: SubmitVerdictInput[] = [];
    const b = useBackendWithFake(seen, null);
    await seedProblem(b.repos);
    const { id } = await createStartedInterview(b, ["prob_two-sum"]);
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/submit-verdict`,
      payload: { language: "python", code: "x = 1\n" },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ ok: false });
    expect(seen).toHaveLength(1);
  });

  it("resolves an explicit problemId with statement and constraints", async () => {
    const seen: SubmitVerdictInput[] = [];
    const b = useBackendWithFake(seen);
    await b.repos.problems.save({
      id: asProblemId("prob_rich"),
      title: "Rich",
      difficulty: "Easy",
      description: "Add two numbers.",
      constraints: ["1 <= n <= 10", "n is an integer"],
    });
    const { id } = await createStartedInterview(b, ["prob_rich"]);
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/submit-verdict`,
      payload: { language: "python", code: "x = 1\n", problemId: "prob_rich" },
    });
    expect(res.statusCode).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.problem).toMatchObject({
      id: "prob_rich",
      title: "Rich",
      statement: "Add two numbers.",
      constraints: "1 <= n <= 10\nn is an integer",
    });
  });

  it("returns 503 with plain copy when the verdict model is unconfigured", async () => {
    backend = buildTestBackend({ submitVerdictModel: new UnconfiguredSubmitVerdictModel() });
    const b = backend;
    await seedProblem(b.repos);
    const { id } = await createStartedInterview(b, ["prob_two-sum"]);
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/submit-verdict`,
      payload: { language: "python", code: "x = 1\n" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      ok: false,
      error: {
        code: "VERDICT_NOT_CONFIGURED",
        message: "Submit verdict is unavailable right now. Try again later.",
      },
    });
  });
});
