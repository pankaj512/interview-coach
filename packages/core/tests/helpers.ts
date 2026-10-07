import type { Result } from "../src/result.js";

export function must<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(
      `expected ok, got ${result.error.code}: ${result.error.message}`,
    );
  }
  return result.value;
}

export function mustErr<T>(result: Result<T>): string {
  if (result.ok) throw new Error("expected err, got ok");
  return result.error.code;
}
