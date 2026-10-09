// @interview-coach/core - async evaluation job.
//
// Owns: the durable hand-off turning a finished interview into a persisted
// Evaluation. `end` completes the interview immediately and enqueues a job;
// the runner claims it, evaluates, persists, and marks job + interview.
// Surprising: in-process runner for v1; the job row keeps worker extraction compatible.
//
// History: Phase 10; see docs/SESSION_HANDOFF.md.

import type { EvaluationJobId, InterviewId } from "./ids.js";
import { newEvaluationJobId } from "./ids.js";

export type EvaluationJobStatus = "pending" | "running" | "completed" | "failed";

export const EVALUATION_JOB_STATUSES: readonly EvaluationJobStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
];

export const MAX_EVALUATION_JOB_ATTEMPTS = 3;

export interface EvaluationJob {
  readonly id: EvaluationJobId;
  readonly interviewId: InterviewId;
  readonly status: EvaluationJobStatus;
  readonly attempts: number;
  readonly lastError?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
}

export interface CreateEvaluationJobInput {
  readonly interviewId: InterviewId;
  readonly now?: Date;
}

export function createEvaluationJob(
  input: CreateEvaluationJobInput,
): EvaluationJob {
  const now = input.now ?? new Date();
  return {
    id: newEvaluationJobId(),
    interviewId: input.interviewId,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}
