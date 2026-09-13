import type { InterviewId, ProblemId, ResponseId } from "./ids.js";
import { newResponseId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Candidate utterances/artefacts captured during the interview. Persisted
// separately from raw conversation (HLD 5.11); evaluation reads these.
export type ResponseKind = "answer" | "approach" | "code" | "question" | "note";

// Shared content cap (audit F5): enforced at the domain boundary so direct
// HTTP recordResponse and the tool path cannot persist unbounded content.
export const MAX_RESPONSE_CONTENT_LENGTH = 10_000;

export interface CandidateResponse {
  readonly id: ResponseId;
  readonly interviewId: InterviewId;
  readonly problemId?: ProblemId;
  readonly kind: ResponseKind;
  readonly content: string;
  readonly createdAt: Date;
}

export interface RecordResponseInput {
  readonly interviewId: InterviewId;
  readonly problemId?: ProblemId;
  readonly kind: ResponseKind;
  readonly content: string;
  readonly now?: Date;
}

export function createCandidateResponse(
  input: RecordResponseInput,
): Result<CandidateResponse> {
  const content = input.content.trim();
  if (content.length === 0) {
    return err(domainError("VALIDATION_ERROR", "Response content must not be empty"));
  }
  if (content.length > MAX_RESPONSE_CONTENT_LENGTH) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `Response content must be at most ${MAX_RESPONSE_CONTENT_LENGTH} characters`,
      ),
    );
  }
  return ok({
    id: newResponseId(),
    interviewId: input.interviewId,
    kind: input.kind,
    content,
    createdAt: input.now ?? new Date(),
    ...(input.problemId === undefined ? {} : { problemId: input.problemId }),
  });
}
