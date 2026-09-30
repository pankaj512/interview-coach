// @interview-coach/domain - EvaluationJob (learning-loop Phase 10).
//
// The async unit of work that turns a finished interview into a persisted,
// validated Evaluation. The job row is the durable hand-off: `end` completes
// the interview immediately and enqueues a job; the runner claims it, calls
// the (server-side) evaluation model or the deterministic fallback, persists
// the evaluation, and marks the job + interview status.
//
// The runner is in-process for v1 (ADR-002: no separate worker service); the
// job row is what makes that extractable later without changing the contract.

import type { EvaluationJobId, InterviewId } from "./ids.js";
import { newEvaluationJobId } from "./ids.js";

export type EvaluationJobStatus = "pending" | "running" | "completed" | "failed";

export const EVALUATION_JOB_STATUSES: readonly EvaluationJobStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
];

export function isEvaluationJobStatus(value: string): value is EvaluationJobStatus {
  return (EVALUATION_JOB_STATUSES as readonly string[]).includes(value);
}

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
