import type { InterviewId, ProblemId, ResponseId } from "./ids.js";
import { newResponseId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Candidate utterances/artefacts captured during the interview. Persisted
// separately from raw conversation (HLD 5.11); evaluation reads these.
export type ResponseKind = "answer" | "approach" | "code" | "question" | "note";

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
  return ok({
    id: newResponseId(),
    interviewId: input.interviewId,
    kind: input.kind,
    content,
    createdAt: input.now ?? new Date(),
    ...(input.problemId === undefined ? {} : { problemId: input.problemId }),
  });
}
