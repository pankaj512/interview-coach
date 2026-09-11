// @interview-coach/domain — structured evaluation pipeline (HLD 5.5/5.8, S5).
//
// Deterministic post-interview scoring. The backend (never the model)
// computes overallScore from dimension scores and derives a recommendation,
// with a one-tier downgrade for heavy hinting (>=3 hints). Explicit inputs
// always win: callers may pin overallScore/recommendation and the pipeline
// keeps them.

import type {
  EvaluationDimension,
  EvaluationRecommendation,
} from "./evaluation.js";
import { EVALUATION_DIMENSIONS } from "./evaluation.js";
import type { DimensionScore } from "./evaluation.js";

export type DimensionMap = Partial<Record<EvaluationDimension, DimensionScore>>;

export interface FinalizeEvaluationInput {
  readonly dimensions?: DimensionMap;
  readonly hintsUsed?: number;
  readonly strengths?: readonly string[];
  readonly weaknesses?: readonly string[];
  readonly recommendation?: EvaluationRecommendation;
  readonly overallScore?: number;
}

export interface FinalizedEvaluation {
  readonly dimensions: DimensionMap;
  readonly hintsUsed: number;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly overallScore: number | null;
  readonly recommendation: EvaluationRecommendation | null;
}

/** Mean of present 0..5 scores scaled to 0..100, or null when empty. */
export function computeOverallScore(dimensions: DimensionMap): number | null {
  const scores: number[] = [];
  for (const dim of EVALUATION_DIMENSIONS) {
    const entry = dimensions[dim];
    if (entry !== undefined) scores.push(entry.score);
  }
  if (scores.length === 0) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round((mean / 5) * 100);
}

function baseRecommendation(overallScore: number): EvaluationRecommendation {
  if (overallScore >= 85) return "hire";
  if (overallScore >= 70) return "lean_hire";
  if (overallScore >= 50) return "lean_no_hire";
  return "no_hire";
}

function downgradeOneTier(
  rec: EvaluationRecommendation,
): EvaluationRecommendation {
  if (rec === "hire") return "lean_hire";
  if (rec === "lean_hire") return "lean_no_hire";
  return "no_hire";
}

/**
 * Derive a recommendation from a score + hint usage. Heavy hinting
 * (>=3 hints) downgrades one tier: guided success is not independent
 * success. Returns null without a score.
 */
export function deriveRecommendation(
  overallScore: number | null,
  hintsUsed: number,
): EvaluationRecommendation | null {
  if (overallScore === null) return null;
  const base = baseRecommendation(overallScore);
  if (hintsUsed >= 3) return downgradeOneTier(base);
  return base;
}

export function finalizeEvaluation(input: FinalizeEvaluationInput): FinalizedEvaluation {
  const dimensions = input.dimensions ?? {};
  const hintsUsed = input.hintsUsed ?? 0;
  const strengths = input.strengths ?? [];
  const weaknesses = input.weaknesses ?? [];
  const overallScore =
    input.overallScore !== undefined ? input.overallScore : computeOverallScore(dimensions);
  const recommendation =
    input.recommendation !== undefined
      ? input.recommendation
      : deriveRecommendation(overallScore, hintsUsed);
  return {
    dimensions,
    hintsUsed,
    strengths,
    weaknesses,
    overallScore,
    recommendation,
  };
}
