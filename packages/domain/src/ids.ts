import { randomUUID } from "node:crypto";

// Branded string IDs. Backend owns identity; the model never mints these.
export type UserId = string & { readonly __brand: "UserId" };
export type InterviewId = string & { readonly __brand: "InterviewId" };
export type ProblemId = string & { readonly __brand: "ProblemId" };
export type ResponseId = string & { readonly __brand: "ResponseId" };
export type EvaluationId = string & { readonly __brand: "EvaluationId" };
export type EventId = string & { readonly __brand: "EventId" };

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

export function newEvaluationId(): EvaluationId {
  return `eval_${randomUUID()}` as EvaluationId;
}

export function newEventId(): EventId {
  return `evt_${randomUUID()}` as EventId;
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

export function asEvaluationId(raw: string): EvaluationId {
  return raw as EvaluationId;
}

export function asEventId(raw: string): EventId {
  return raw as EventId;
}
