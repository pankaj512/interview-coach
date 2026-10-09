// @interview-coach/api - evaluation input assembly.
//
// Owns: the pure mapping from backend-owned state (transcript, responses,
// submissions, runs) to the evaluation model's input. The model never
// reads repositories directly. No LLM here.
//
// History: Phase 10; see docs/SESSION_HANDOFF.md.

import type {
  CandidateResponse,
  CodeRun,
  CodeSubmission,
  EvaluationModelInput,
  EvaluationModelTopic,
  Interview,
  InterviewMessage,
  Problem,
  UserProfile,
  UserSkillState,
} from "@interview-coach/core";

export interface AssembleEvaluationContextInput {
  readonly interview: Interview;
  readonly problem: Problem | null;
  readonly topic: EvaluationModelTopic | null;
  readonly profile: UserProfile | null;
  readonly skillState: UserSkillState | null;
  readonly transcript: readonly InterviewMessage[];
  readonly responses: readonly CandidateResponse[];
  readonly submissions: readonly CodeSubmission[];
  readonly runs: readonly CodeRun[];
  readonly hintsUsed: number;
}

export function assembleEvaluationContext(
  input: AssembleEvaluationContextInput,
): EvaluationModelInput {
  return {
    interviewId: input.interview.id,
    candidateId: input.interview.candidateId,
    status: input.interview.status,
    configuration: input.interview.configuration,
    problem: input.problem,
    topic: input.topic,
    profile: input.profile,
    skillState: input.skillState,
    transcript: input.transcript.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    responses: input.responses.map((response) => ({
      kind: response.kind,
      content: response.content,
    })),
    submissions: input.submissions.map((submission) => ({
      language: submission.language,
      codeLength: submission.code.length,
    })),
    runs: input.runs.map((run) => ({
      status: run.status,
      passedCount: run.passedCount,
      totalCount: run.totalCount,
    })),
    hintsUsed: input.hintsUsed,
  };
}
