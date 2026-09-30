// @interview-coach/domain - InterviewMessage (learning-loop Phase 9).
//
// Structured transcript of the realtime conversation. The browser forwards the
// relevant Voice Live transcript events to the backend, which validates and
// persists them (roadmap locked decision 6): the backend is canonical, and the
// model never owns the transcript. Structured text only - no raw audio.
//
// Roles are deliberately small: "candidate", "interviewer", and "system"
// (lifecycle notices). Content is trimmed and length-capped at the domain
// boundary so a direct HTTP append and any future path share one guard.

import type { InterviewId, MessageId, ProblemId } from "./ids.js";
import { newMessageId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

export const INTERVIEW_MESSAGE_ROLES = ["candidate", "interviewer", "system"] as const;

export type InterviewMessageRole = (typeof INTERVIEW_MESSAGE_ROLES)[number];

export function isInterviewMessageRole(value: string): value is InterviewMessageRole {
  return (INTERVIEW_MESSAGE_ROLES as readonly string[]).includes(value);
}

export const MAX_MESSAGE_CONTENT_LENGTH = 10_000;

export interface InterviewMessage {
  readonly id: MessageId;
  readonly interviewId: InterviewId;
  readonly role: InterviewMessageRole;
  readonly content: string;
  readonly problemId?: ProblemId;
  readonly createdAt: Date;
}

export interface CreateInterviewMessageInput {
  readonly interviewId: InterviewId;
  readonly role: InterviewMessageRole;
  readonly content: string;
  readonly problemId?: ProblemId;
  readonly now?: Date;
}

export function createInterviewMessage(
  input: CreateInterviewMessageInput,
): Result<InterviewMessage> {
  if (!isInterviewMessageRole(input.role)) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `Unknown message role: ${String(input.role)}`,
        { allowed: INTERVIEW_MESSAGE_ROLES },
      ),
    );
  }
  const content = input.content.trim();
  if (content.length === 0) {
    return err(domainError("VALIDATION_ERROR", "Message content must not be empty"));
  }
  if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `Message content must be at most ${MAX_MESSAGE_CONTENT_LENGTH} characters`,
      ),
    );
  }
  return ok({
    id: newMessageId(),
    interviewId: input.interviewId,
    role: input.role,
    content,
    createdAt: input.now ?? new Date(),
    ...(input.problemId === undefined ? {} : { problemId: input.problemId }),
  });
}
