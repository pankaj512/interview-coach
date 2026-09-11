// Domain -> JSON serializers (S3). Tool results and API bodies must be
// JSON-serializable (ISO timestamps) for Voice Live function_call_output.

import type {
  Evaluation,
  Interview,
  InterviewProblem,
  InterviewStateSnapshot,
  Problem,
} from "@interview-coach/domain";

export interface SerializedInterview {
  readonly id: string;
  readonly candidateId: string;
  readonly type: string;
  readonly status: string;
  readonly configuration: Interview["configuration"];
  readonly problems: readonly InterviewProblem[];
  readonly currentOrder: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
}

export interface SerializedStateSnapshot {
  readonly interview: SerializedInterview;
  readonly currentProblem: Problem | null;
  readonly responseCount: number;
  readonly evaluation: SerializedEvaluation | null;
}

export interface SerializedEvaluation {
  readonly id: string;
  readonly interviewId: string;
  readonly dimensions: Evaluation["dimensions"];
  readonly hintsUsed: number;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly recommendation?: Evaluation["recommendation"];
  readonly overallScore?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function serializeInterview(interview: Interview): SerializedInterview {
  return {
    id: interview.id,
    candidateId: interview.candidateId,
    type: interview.type,
    status: interview.status,
    configuration: interview.configuration,
    problems: interview.problems,
    currentOrder: interview.currentOrder,
    createdAt: interview.createdAt.toISOString(),
    updatedAt: interview.updatedAt.toISOString(),
    ...(interview.startedAt === undefined
      ? {}
      : { startedAt: interview.startedAt.toISOString() }),
    ...(interview.endedAt === undefined
      ? {}
      : { endedAt: interview.endedAt.toISOString() }),
  };
}

export function serializeEvaluation(evaluation: Evaluation): SerializedEvaluation {
  return {
    id: evaluation.id,
    interviewId: evaluation.interviewId,
    dimensions: evaluation.dimensions,
    hintsUsed: evaluation.hintsUsed,
    strengths: evaluation.strengths,
    weaknesses: evaluation.weaknesses,
    ...(evaluation.recommendation === undefined
      ? {}
      : { recommendation: evaluation.recommendation }),
    ...(evaluation.overallScore === undefined
      ? {}
      : { overallScore: evaluation.overallScore }),
    createdAt: evaluation.createdAt.toISOString(),
    updatedAt: evaluation.updatedAt.toISOString(),
  };
}

export function serializeStateSnapshot(
  snapshot: InterviewStateSnapshot,
): SerializedStateSnapshot {
  return {
    interview: serializeInterview(snapshot.interview),
    currentProblem: snapshot.currentProblem,
    responseCount: snapshot.responseCount,
    evaluation:
      snapshot.evaluation === null ? null : serializeEvaluation(snapshot.evaluation),
  };
}
