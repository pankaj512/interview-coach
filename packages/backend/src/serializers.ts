// Domain -> JSON serializers (S3). Tool results and API bodies must be
// JSON-serializable (ISO timestamps) for Voice Live function_call_output.

import type {
  CodeRun,
  CodeSubmission,
  Evaluation,
  Interview,
  InterviewProblem,
  InterviewStateSnapshot,
  Problem,
  UserProfile,
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

// Learning-loop Phase 2: server-owned profile (ISO timestamps like the rest).
export interface SerializedUserProfile {
  readonly userId: string;
  readonly interviewTypes: readonly string[];
  readonly role: string;
  readonly level: string;
  readonly goals?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function serializeUserProfile(profile: UserProfile): SerializedUserProfile {
  return {
    userId: profile.userId,
    interviewTypes: profile.interviewTypes,
    role: profile.role,
    level: profile.level,
    ...(profile.goals === undefined ? {} : { goals: profile.goals }),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

// S7a sandbox serializers: ISO timestamps like the rest; hidden cases are
// already masked at assembly time so stored rows are safe to return.
export interface SerializedSubmission {
  readonly id: string;
  readonly interviewId: string;
  readonly problemId?: string;
  readonly language: string;
  readonly code: string;
  readonly createdAt: string;
}

export interface SerializedTestResult {
  readonly name: string;
  readonly hidden: boolean;
  readonly passed: boolean;
  readonly actual?: unknown;
  readonly error?: string;
}

export interface SerializedRun {
  readonly id: string;
  readonly submissionId: string;
  readonly interviewId: string;
  readonly status: string;
  readonly results: readonly SerializedTestResult[];
  readonly passedCount: number;
  readonly totalCount: number;
  readonly durationMs: number;
  readonly createdAt: string;
}

export function serializeSubmission(
  submission: CodeSubmission,
): SerializedSubmission {
  return {
    id: submission.id,
    interviewId: submission.interviewId,
    language: submission.language,
    code: submission.code,
    createdAt: submission.createdAt.toISOString(),
    ...(submission.problemId === undefined
      ? {}
      : { problemId: submission.problemId }),
  };
}

export function serializeRun(run: CodeRun): SerializedRun {
  return {
    id: run.id,
    submissionId: run.submissionId,
    interviewId: run.interviewId,
    status: run.status,
    results: run.results.map((r) => ({
      name: r.name,
      hidden: r.hidden,
      passed: r.passed,
      ...(r.actual === undefined ? {} : { actual: r.actual }),
      ...(r.error === undefined ? {} : { error: r.error }),
    })),
    passedCount: run.passedCount,
    totalCount: run.totalCount,
    durationMs: run.durationMs,
    createdAt: run.createdAt.toISOString(),
  };
}
