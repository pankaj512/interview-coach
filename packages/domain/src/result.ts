import type { DomainError } from "./errors.js";

// Railway-style result. Domain services return Result instead of throwing
// so tool routing (S3) and API layers (S2) can map errors deterministically.
export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<T = never, E = DomainError>(error: E): Result<T, E> {
  return { ok: false, error };
}

export function isErr<T, E>(
  result: Result<T, E>,
): result is { readonly ok: false; readonly error: E } {
  return !result.ok;
}
