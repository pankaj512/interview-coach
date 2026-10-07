export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "ILLEGAL_TRANSITION"
  | "NO_CURRENT_PROBLEM"
  | "CONFLICT"
  // F6-3: quota/capacity limits (retryable) enforced in the service so both
  // the HTTP routes and the model tool path share one enforcement point.
  | "RATE_LIMITED";

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export function domainError(
  code: DomainErrorCode,
  message: string,
  details?: Record<string, unknown>,
): DomainError {
  return details === undefined
    ? { code, message }
    : { code, message, details };
}
