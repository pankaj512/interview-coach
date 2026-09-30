import { randomUUID } from "node:crypto";

// Branded string IDs. Backend owns identity; the model never mints these.
export type UserId = string & { readonly __brand: "UserId" };
export type InterviewId = string & { readonly __brand: "InterviewId" };
export type ProblemId = string & { readonly __brand: "ProblemId" };
export type ResponseId = string & { readonly __brand: "ResponseId" };
export type SubmissionId = string & { readonly __brand: "SubmissionId" };
export type RunId = string & { readonly __brand: "RunId" };
export type EvaluationId = string & { readonly __brand: "EvaluationId" };
export type EventId = string & { readonly __brand: "EventId" };
// Learning-loop Phase 4: a persisted recommendation (LLM-proposed, backend-
// validated). UUID-minted like the other per-user artefacts.
export type RecommendationId = string & { readonly __brand: "RecommendationId" };
// Learning-loop Phase 9: a persisted transcript message (structured, no raw
// audio). UUID-minted like the other per-interview artefacts.
export type MessageId = string & { readonly __brand: "MessageId" };
// Learning-loop Phase 10: an async evaluation job.
export type EvaluationJobId = string & { readonly __brand: "EvaluationJobId" };
// Learning-loop Phase 3: curriculum is stable seeded config, so these IDs are
// deterministic slugs (no UUID minting) - see curriculum.ts.
export type CurriculumId = string & { readonly __brand: "CurriculumId" };
export type ModuleId = string & { readonly __brand: "ModuleId" };
export type TopicId = string & { readonly __brand: "TopicId" };

export function newUserId(): UserId {
  return `user_${randomUUID()}` as UserId;
}

export function newInterviewId(): InterviewId {
  return `iv_${randomUUID()}` as InterviewId;
}

export function newProblemId(): ProblemId {
  return `prob_${randomUUID()}` as ProblemId;
}

export function newResponseId(): ResponseId {
  return `resp_${randomUUID()}` as ResponseId;
}

export function newSubmissionId(): SubmissionId {
  return `sub_${randomUUID()}` as SubmissionId;
}

export function newRunId(): RunId {
  return `run_${randomUUID()}` as RunId;
}

export function newEvaluationId(): EvaluationId {
  return `eval_${randomUUID()}` as EvaluationId;
}

export function newEventId(): EventId {
  return `evt_${randomUUID()}` as EventId;
}

export function newRecommendationId(): RecommendationId {
  return `rec_${randomUUID()}` as RecommendationId;
}

export function newMessageId(): MessageId {
  return `msg_${randomUUID()}` as MessageId;
}

export function newEvaluationJobId(): EvaluationJobId {
  return `ejob_${randomUUID()}` as EvaluationJobId;
}

// Explicit casts for stable/seeded IDs (catalog import, tests, S2 seeding).
export function asUserId(raw: string): UserId {
  return raw as UserId;
}

export function asInterviewId(raw: string): InterviewId {
  return raw as InterviewId;
}

export function asProblemId(raw: string): ProblemId {
  return raw as ProblemId;
}

export function asResponseId(raw: string): ResponseId {
  return raw as ResponseId;
}

export function asSubmissionId(raw: string): SubmissionId {
  return raw as SubmissionId;
}

export function asRunId(raw: string): RunId {
  return raw as RunId;
}

export function asEvaluationId(raw: string): EvaluationId {
  return raw as EvaluationId;
}

export function asEventId(raw: string): EventId {
  return raw as EventId;
}

export function asRecommendationId(raw: string): RecommendationId {
  return raw as RecommendationId;
}

export function asMessageId(raw: string): MessageId {
  return raw as MessageId;
}

export function asEvaluationJobId(raw: string): EvaluationJobId {
  return raw as EvaluationJobId;
}

export function asCurriculumId(raw: string): CurriculumId {
  return raw as CurriculumId;
}

export function asModuleId(raw: string): ModuleId {
  return raw as ModuleId;
}

export function asTopicId(raw: string): TopicId {
  return raw as TopicId;
}
