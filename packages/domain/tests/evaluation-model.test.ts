// Phase 10: evaluation proposal validation + deterministic fallback.

import { describe, expect, it } from "vitest";
import {
  buildFallbackEvaluation,
  validateEvaluationProposal,
  type EvaluationModelInput,
} from "../src/index.js";

function input(overrides: Partial<EvaluationModelInput> = {}): EvaluationModelInput {
  return {
    interviewId: "iv_1",
    candidateId: "user_1",
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
    ...overrides,
  };
}

describe("validateEvaluationProposal", () => {
  it("accepts a valid proposal and trims notes", () => {
    const proposal = validateEvaluationProposal({
      dimensions: { correctness: { score: 4, notes: "  solid  " }, independence: { score: 3 } },
      strengths: ["clear"],
      weaknesses: ["edge cases"],
    });
    expect(proposal).not.toBeNull();
    expect(proposal?.dimensions.correctness).toEqual({ score: 4, notes: "solid" });
    expect(proposal?.strengths).toEqual(["clear"]);
  });

  it("rejects unknown dimensions, bad scores, and malformed lists", () => {
    expect(validateEvaluationProposal({ dimensions: { telepathy: { score: 5 } } })).toBeNull();
    expect(validateEvaluationProposal({ dimensions: { correctness: { score: 9 } } })).toBeNull();
    expect(validateEvaluationProposal({ dimensions: {}, strengths: "nope" })).toBeNull();
    expect(validateEvaluationProposal(null)).toBeNull();
  });

  it("allows an empty dimensions map (service falls back)", () => {
    expect(validateEvaluationProposal({ dimensions: {}, strengths: [], weaknesses: [] })).toEqual({
      dimensions: {},
      strengths: [],
      weaknesses: [],
    });
  });
});

describe("buildFallbackEvaluation", () => {
  it("is deterministic and grounded in responses/runs/hints", () => {
    const proposal = buildFallbackEvaluation(
      input({
        transcript: [
          { role: "candidate", content: "I would use a hash map." },
          { role: "interviewer", content: "Go on." },
        ],
        responses: [{ kind: "approach", content: "hash map" }],
        submissions: [{ language: "javascript", codeLength: 42 }],
        runs: [{ status: "passed", passedCount: 3, totalCount: 3 }],
        hintsUsed: 0,
      }),
    );
    expect(proposal.dimensions.approach?.score).toBe(4);
    expect(proposal.dimensions.correctness?.score).toBe(5);
    expect(proposal.dimensions.independence?.score).toBe(5);
    expect(proposal.dimensions.code_quality?.score).toBe(3);
    expect(proposal.strengths.length).toBeGreaterThan(0);
  });

  it("lowers independence and flags weaknesses with heavy hints / failures", () => {
    const proposal = buildFallbackEvaluation(
      input({
        submissions: [{ language: "javascript", codeLength: 10 }],
        runs: [{ status: "failed", passedCount: 1, totalCount: 3 }],
        hintsUsed: 3,
      }),
    );
    expect(proposal.dimensions.independence?.score).toBe(2);
    expect(proposal.weaknesses).toContain("Needed heavy hinting; practice independence.");
    expect(proposal.weaknesses).toContain("Some executed cases failed; revisit edge cases.");
  });

  it("omits dimensions with no evidence", () => {
    const proposal = buildFallbackEvaluation(input());
    expect(proposal.dimensions.correctness).toBeUndefined();
    expect(proposal.dimensions.code_quality).toBeUndefined();
    expect(proposal.weaknesses).toContain("No substantive responses were captured.");
  });
});
