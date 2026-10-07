import { describe, expect, it } from "vitest";
import {
  computeOverallScore,
  deriveRecommendation,
  finalizeEvaluation,
} from "../src/evaluation-pipeline.js";

describe("evaluation pipeline", () => {
  it("scores the mean of present dimensions scaled to 0..100", () => {
    expect(
      computeOverallScore({
        problem_understanding: { score: 5 },
        approach: { score: 4 },
        coding: { score: 3 },
        complexity_analysis: { score: 4 },
      }),
    ).toBe(80);
    expect(computeOverallScore({})).toBeNull();
  });

  it("derives recommendations with a heavy-hint downgrade", () => {
    expect(deriveRecommendation(90, 0)).toBe("hire");
    expect(deriveRecommendation(90, 3)).toBe("lean_hire");
    expect(deriveRecommendation(75, 0)).toBe("lean_hire");
    expect(deriveRecommendation(55, 5)).toBe("no_hire");
    expect(deriveRecommendation(20, 0)).toBe("no_hire");
    expect(deriveRecommendation(null, 0)).toBeNull();
  });

  it("finalizes explicit scores, deriving missing fields", () => {
    const finalized = finalizeEvaluation({
      dimensions: { coding: { score: 4 }, approach: { score: 4 } },
      hintsUsed: 1,
      strengths: ["clear communication"],
      weaknesses: ["missed edge case"],
    });
    expect(finalized.overallScore).toBe(80);
    expect(finalized.recommendation).toBe("lean_hire");
  });

  it("keeps explicitly pinned score and recommendation", () => {
    const finalized = finalizeEvaluation({
      dimensions: { coding: { score: 1 } },
      overallScore: 95,
      recommendation: "hire",
    });
    expect(finalized.overallScore).toBe(95);
    expect(finalized.recommendation).toBe("hire");
  });
});
