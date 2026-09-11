import type { EvaluationId, InterviewId } from "./ids.js";
import { newEvaluationId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Structured evaluation, persisted independently from raw conversation
// (HLD 5.8/5.11). Dimensions mirror the HLD evaluation list.
export type EvaluationDimension =
  | "understanding"
  | "approach"
  | "correctness"
  | "complexity"
  | "edge_cases"
  | "communication"
  | "code_quality"
  | "independence";

export const EVALUATION_DIMENSIONS: readonly EvaluationDimension[] = [
  "understanding",
  "approach",
  "correctness",
  "complexity",
  "edge_cases",
  "communication",
  "code_quality",
  "independence",
];

export interface DimensionScore {
  readonly score: number;
  readonly notes?: string;
}

export type EvaluationRecommendation =
  | "hire"
  | "lean_hire"
  | "lean_no_hire"
  | "no_hire";

export interface Evaluation {
  readonly id: EvaluationId;
  readonly interviewId: InterviewId;
  readonly dimensions: Partial<Record<EvaluationDimension, DimensionScore>>;
  readonly hintsUsed: number;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly recommendation?: EvaluationRecommendation;
  readonly overallScore?: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEvaluationInput {
  readonly interviewId: InterviewId;
  readonly dimensions?: Partial<Record<EvaluationDimension, DimensionScore>>;
  readonly hintsUsed?: number;
  readonly strengths?: readonly string[];
  readonly weaknesses?: readonly string[];
  readonly recommendation?: EvaluationRecommendation;
  readonly overallScore?: number;
  readonly now?: Date;
}

function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= 5;
}

export function createEvaluation(
  input: CreateEvaluationInput,
): Result<Evaluation> {
  const dimensions = input.dimensions ?? {};
  for (const dim of Object.keys(dimensions) as EvaluationDimension[]) {
    const entry = dimensions[dim];
    if (entry !== undefined && !isValidScore(entry.score)) {
      return err(
        domainError(
          "VALIDATION_ERROR",
          `Dimension ${dim} score must be an integer 0..5`,
          { dimension: dim },
        ),
      );
    }
  }
  const hintsUsed = input.hintsUsed ?? 0;
  if (!Number.isInteger(hintsUsed) || hintsUsed < 0) {
    return err(
      domainError("VALIDATION_ERROR", "hintsUsed must be a non-negative integer"),
    );
  }
  if (
    input.overallScore !== undefined &&
    (!Number.isInteger(input.overallScore) ||
      input.overallScore < 0 ||
      input.overallScore > 100)
  ) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        "overallScore must be an integer 0..100",
      ),
    );
  }
  const now = input.now ?? new Date();
  return ok({
    id: newEvaluationId(),
    interviewId: input.interviewId,
    dimensions,
    hintsUsed,
    strengths: input.strengths ?? [],
    weaknesses: input.weaknesses ?? [],
    createdAt: now,
    updatedAt: now,
    ...(input.recommendation === undefined
      ? {}
      : { recommendation: input.recommendation }),
    ...(input.overallScore === undefined
      ? {}
      : { overallScore: input.overallScore }),
  });
}
