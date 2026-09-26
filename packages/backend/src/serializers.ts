// Domain -> JSON serializers (S3). Tool results and API bodies must be
// JSON-serializable (ISO timestamps) for Voice Live function_call_output.

import type {
  CodeRun,
  CodeSubmission,
  Curriculum,
  Evaluation,
  Interview,
  InterviewMessage,
  InterviewProblem,
  InterviewStateSnapshot,
  Problem,
  ProblemExample,
  ProblemRunnerLinks,
  ProblemStarters,
  Recommendation,
  SubmitVerdict,
  UserCurriculumProgress,
  UserProfile,
  UserSkillState,
} from "@interview-coach/domain";

export interface SerializedInterview {
  readonly id: string;
  readonly candidateId: string;
  readonly type: string;
  readonly status: string;
  readonly configuration: Interview["configuration"];
  readonly problems: readonly InterviewProblem[];
  readonly currentOrder: number | null;
  /** Learning-loop Phase 9: recommendation/topic linkage. */
  readonly recommendationId?: string;
  readonly topicId?: string;
  readonly evaluationStatus: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
}

// Phase 9: one history-list row (interview + its latest evaluation summary).
export interface SerializedInterviewSummary {
  readonly interview: SerializedInterview;
  readonly evaluation: SerializedEvaluation | null;
}

export interface SerializedInterviewMessage {
  readonly id: string;
  readonly interviewId: string;
  readonly role: string;
  readonly content: string;
  readonly problemId?: string;
  readonly createdAt: string;
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
  readonly topicId?: string;
  readonly status: string;
  readonly source?: string;
  readonly jobId?: string;
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
    ...(interview.recommendationId === undefined
      ? {}
      : { recommendationId: interview.recommendationId }),
    ...(interview.topicId === undefined ? {} : { topicId: interview.topicId }),
    evaluationStatus: interview.evaluationStatus,
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

// Phase 9 history row: the interview + its latest evaluation (if any).
export function serializeInterviewSummary(
  interview: Interview,
  evaluation: Evaluation | null,
): SerializedInterviewSummary {
  return {
    interview: serializeInterview(interview),
    evaluation: evaluation === null ? null : serializeEvaluation(evaluation),
  };
}

export function serializeInterviewMessage(
  message: InterviewMessage,
): SerializedInterviewMessage {
  return {
    id: message.id,
    interviewId: message.interviewId,
    role: message.role,
    content: message.content,
    ...(message.problemId === undefined ? {} : { problemId: message.problemId }),
    createdAt: message.createdAt.toISOString(),
  };
}

export function serializeEvaluation(evaluation: Evaluation): SerializedEvaluation {
  return {
    id: evaluation.id,
    interviewId: evaluation.interviewId,
    status: evaluation.status,
    dimensions: evaluation.dimensions,
    hintsUsed: evaluation.hintsUsed,
    strengths: evaluation.strengths,
    weaknesses: evaluation.weaknesses,
    ...(evaluation.topicId === undefined ? {} : { topicId: evaluation.topicId }),
    ...(evaluation.source === undefined ? {} : { source: evaluation.source }),
    ...(evaluation.jobId === undefined ? {} : { jobId: evaluation.jobId }),
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

// Learning-loop Phase 3: curriculum + per-user skill state. Curriculum is
// static config (string IDs only); skill/progress carry ISO timestamps.
export interface SerializedCurriculumModule {
  readonly id: string;
  readonly curriculumId: string;
  readonly order: number;
  readonly name: string;
  readonly objective?: string;
  readonly topicIds: readonly string[];
}

export interface SerializedCurriculumTopic {
  readonly id: string;
  readonly curriculumId: string;
  readonly moduleId: string;
  readonly order: number;
  readonly name: string;
  readonly problemIds: readonly string[];
}

export interface SerializedCurriculum {
  readonly id: string;
  readonly interviewType: string;
  readonly name: string;
  readonly version: number;
  readonly modules: readonly SerializedCurriculumModule[];
  readonly topics: readonly SerializedCurriculumTopic[];
}

export function serializeCurriculum(curriculum: Curriculum): SerializedCurriculum {
  return {
    id: curriculum.id,
    interviewType: curriculum.interviewType,
    name: curriculum.name,
    version: curriculum.version,
    modules: curriculum.modules.map((module) => ({
      id: module.id,
      curriculumId: module.curriculumId,
      order: module.order,
      name: module.name,
      ...(module.objective === undefined ? {} : { objective: module.objective }),
      topicIds: module.topicIds,
    })),
    topics: curriculum.topics.map((topic) => ({
      id: topic.id,
      curriculumId: topic.curriculumId,
      moduleId: topic.moduleId,
      order: topic.order,
      name: topic.name,
      problemIds: topic.problemIds,
    })),
  };
}

export interface SerializedUserSkillState {
  readonly userId: string;
  readonly curriculumId: string;
  readonly topicId: string;
  readonly masteryLevel: string;
  readonly successfulAttempts: number;
  readonly totalAttempts: number;
  readonly lastAttemptAt?: string;
  readonly lastOutcome?: string;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function serializeUserSkillState(
  state: UserSkillState,
): SerializedUserSkillState {
  return {
    userId: state.userId,
    curriculumId: state.curriculumId,
    topicId: state.topicId,
    masteryLevel: state.masteryLevel,
    successfulAttempts: state.successfulAttempts,
    totalAttempts: state.totalAttempts,
    ...(state.lastAttemptAt === undefined
      ? {}
      : { lastAttemptAt: state.lastAttemptAt.toISOString() }),
    ...(state.lastOutcome === undefined ? {} : { lastOutcome: state.lastOutcome }),
    strengths: state.strengths,
    weaknesses: state.weaknesses,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

export interface SerializedUserCurriculumProgress {
  readonly userId: string;
  readonly curriculumId: string;
  readonly currentTopicId?: string;
  readonly completedTopicIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function serializeUserCurriculumProgress(
  progress: UserCurriculumProgress,
): SerializedUserCurriculumProgress {
  return {
    userId: progress.userId,
    curriculumId: progress.curriculumId,
    ...(progress.currentTopicId === undefined
      ? {}
      : { currentTopicId: progress.currentTopicId }),
    completedTopicIds: progress.completedTopicIds,
    createdAt: progress.createdAt.toISOString(),
    updatedAt: progress.updatedAt.toISOString(),
  };
}

// Learning-loop Phase 4: persisted recommendation (LLM-proposed or fallback).
export interface SerializedRecommendation {
  readonly id: string;
  readonly userId: string;
  readonly curriculumId: string;
  readonly recommendationType: string;
  readonly topicId: string;
  readonly problemId: string;
  readonly reason: string;
  readonly source: string;
  readonly status: string;
  readonly acceptedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function serializeRecommendation(
  recommendation: Recommendation,
): SerializedRecommendation {
  return {
    id: recommendation.id,
    userId: recommendation.userId,
    curriculumId: recommendation.curriculumId,
    recommendationType: recommendation.recommendationType,
    topicId: recommendation.topicId,
    problemId: recommendation.problemId,
    reason: recommendation.reason,
    source: recommendation.source,
    status: recommendation.status,
    ...(recommendation.acceptedAt === undefined
      ? {}
      : { acceptedAt: recommendation.acceptedAt.toISOString() }),
    createdAt: recommendation.createdAt.toISOString(),
    updatedAt: recommendation.updatedAt.toISOString(),
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

export function serializeSubmission(  submission: CodeSubmission,
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

// Feature 18d: AI-only Submit verdict. The domain validator already
// normalized the proposal, so this is a structural pass-through.
export interface SerializedSubmitVerdict {
  readonly correctness: string;
  readonly correctnessNotes: string;
  readonly optimality: string;
  readonly optimalityNotes: string;
  readonly breakPoints: readonly string[];
  readonly edgeCases: readonly string[];
  readonly summary: string;
}

export function serializeSubmitVerdict(
  verdict: SubmitVerdict,
): SerializedSubmitVerdict {
  return {
    correctness: verdict.correctness,
    correctnessNotes: verdict.correctnessNotes,
    optimality: verdict.optimality,
    optimalityNotes: verdict.optimalityNotes,
    breakPoints: [...verdict.breakPoints],
    edgeCases: [...verdict.edgeCases],
    summary: verdict.summary,
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

// Feature 18c: the problem-content slice served by
// GET /api/problems/:id/content. Nullable fields use explicit nulls (not
// omission) so title-only gap problems have a stable shape.
export interface SerializedProblemContent {
  readonly id: string;
  readonly title: string;
  readonly difficulty: string;
  readonly description: string | null;
  readonly constraints: readonly string[] | null;
  readonly examples: readonly ProblemExample[] | null;
  readonly starters: ProblemStarters | null;
  readonly runnerLinks: ProblemRunnerLinks | null;
}

export function serializeProblemContent(problem: Problem): SerializedProblemContent {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    description: problem.description ?? null,
    constraints: problem.constraints ?? null,
    examples: problem.examples ?? null,
    starters: problem.starters ?? null,
    runnerLinks: problem.runnerLinks ?? null,
  };
}
