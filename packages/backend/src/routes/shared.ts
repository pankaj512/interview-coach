import { z } from "zod";

export const idParamSchema = z.object({ id: z.string().min(1).max(200) });

// S7a sandbox (HLD 6.1/6.3): candidate code submission + test execution.
// Caps mirror the domain (50k code chars, 50 cases, 100ms..30s timeout).
export const submitCodeSchema = z.object({
  language: z.enum(["javascript", "python", "cpp"]),
  code: z.string().min(1).max(50_000),
  problemId: z.string().min(1).max(200).optional(),
});

export function zodMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (first === undefined) return "Invalid request";
  const path = first.path.join(".");
  return path === "" ? first.message : `${path}: ${first.message}`;
}

export function errorBody(record: { ok: boolean; error: { code: string; message: string } | null }): {
  status: number;
  body: { ok: false; error: { code: string; message: string; retryable: boolean } };
} {
  // Stored failures are permanent domain errors (retryable:false), which is
  // exactly what the browser forwarder must not retry (frozen section 5).
  const code = record.error?.code ?? "INTERNAL_ERROR";
  const message = record.error?.message ?? "Tool execution failed";
  const status = code === "NOT_FOUND" ? 404 : code === "VALIDATION_ERROR" ? 400 : 409;
  return { status, body: { ok: false, error: { code, message, retryable: false } } };
}
