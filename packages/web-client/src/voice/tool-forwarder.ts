// @interview-coach/web-client — tool-call forwarder (frozen section 5).
//
// Tool path: Voice Live --function_call--> Browser --POST /tool-exec-->
// Fastify --result--> Browser --function_call_output--> Voice Live.
//
// Locked defaults honored here:
// - Preserve the original Voice Live `call_id` on every attempt.
// - 8s request timeout, max 2 retries (3 attempts), same `call_id`.
// - Backoff ~300ms -> 800ms + jitter between attempts.
// - Retry ONLY timeout/network/502/503/504/`retryable:true`. Never retry
//   4xx / `retryable:false` / validation / authz — those are permanent,
//   model-facing results.
// - Exactly-once `function_call_output` per `call_id` (submitted-set).
// - Reconnect: queue unacked outputs (bounded 20), flush on reconnect
//   skipping acked; reload rehydration goes through `GET tool-results`
//   (see pending-store.ts + voice-client.ts).
//
// Pure logic: time, sleep, and jitter are injected so vitest covers the
// policy without timers or the network.

import { BackendApiError } from "../api/backend-client.js";
import type { ToolArgs, ToolExecOutcome, ToolName } from "../api/types.js";

export const TOOL_TIMEOUT_MS = 8000;
export const TOOL_MAX_RETRIES = 2;
export const TOOL_BACKOFF_BASE_MS = 300;
export const TOOL_BACKOFF_CAP_MS = 800;
export const TOOL_PENDING_QUEUE_CAP = 20;

export type ToolExecutor = (
  callId: string,
  tool: ToolName,
  signal: AbortSignal,
  args?: ToolArgs,
) => Promise<ToolExecOutcome>;

export interface ForwarderClocks {
  readonly sleep: (ms: number) => Promise<void>;
  readonly random: () => number;
}

export interface ForwardResult {
  readonly output: string;
  readonly replayed: boolean;
  readonly attempts: number;
  readonly retried: boolean;
}

export interface QueuedOutput {
  readonly callId: string;
  readonly output: string;
}

const defaultClocks: ForwarderClocks = {
  sleep: (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  random: () => Math.random(),
};

export function backoffMs(attempt: number, random: () => number): number {
  // attempt is 0-based (0 = after first failure). ~300ms -> ~800ms + jitter.
  const base = Math.min(TOOL_BACKOFF_BASE_MS * 2 ** attempt, TOOL_BACKOFF_CAP_MS);
  return base + Math.floor(random() * 200);
}

export function isRetryableFailure(error: unknown, outcome?: ToolExecOutcome): boolean {
  // Permanent tool results (returned as data) are never retried.
  if (outcome !== undefined && !outcome.ok) return false;
  if (error instanceof BackendApiError) {
    if (error.status === 0) return true; // timeout / network
    if (error.status === 502 || error.status === 503 || error.status === 504) return true;
    return error.retryable === true && error.status >= 500;
  }
  if (error instanceof Error && error.name === "AbortError") return true; // our 8s timeout
  if (error instanceof Error && error.name === "TimeoutError") return true;
  return false;
}

export function toFunctionCallOutput(callId: string, outcome: ToolExecOutcome): string {
  if (outcome.ok) {
    return JSON.stringify({ call_id: callId, result: outcome.result });
  }
  return JSON.stringify({
    call_id: callId,
    error: { code: outcome.code, message: outcome.message },
  });
}

// Executes one tool call with the frozen retry policy and returns the exact
// string to submit as `function_call_output`. The same `callId` is used for
// every attempt so backend idempotency dedups server-side. S5: model- or
// UI-supplied `args` travel with every attempt (same call_id => same args).
export async function forwardToolCall(
  exec: ToolExecutor,
  callId: string,
  tool: ToolName,
  options?: {
    readonly timeoutMs?: number;
    readonly maxRetries?: number;
    readonly clocks?: ForwarderClocks;
    readonly args?: ToolArgs;
  },
): Promise<ForwardResult> {
  const timeoutMs = options?.timeoutMs ?? TOOL_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? TOOL_MAX_RETRIES;
  const clocks = options?.clocks ?? defaultClocks;
  const args = options?.args;
  let attempts = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const outcome = await exec(callId, tool, controller.signal, args);
      clearTimeout(timer);
      if (!outcome.ok) {
        return { output: toFunctionCallOutput(callId, outcome), replayed: outcome.replayed, attempts, retried: attempts > 1 };
      }
      return { output: toFunctionCallOutput(callId, outcome), replayed: outcome.replayed, attempts, retried: attempts > 1 };
    } catch (error) {
      clearTimeout(timer);
      // Total attempts = maxRetries + 1 (initial try plus retries).
      if (!isRetryableFailure(error) || attempts > maxRetries) {
        throw error;
      }
      await clocks.sleep(backoffMs(attempts - 1, clocks.random));
    }
  }
}

// Exactly-once submission ledger + bounded unacked queue (frozen section 5).
// `markSubmitted` returns false when this `call_id` already produced output —
// the caller must then skip sending a duplicate `function_call_output`.
export class ToolOutputLedger {
  private readonly submitted = new Set<string>();
  private queue: QueuedOutput[] = [];

  get pendingCount(): number {
    return this.queue.length;
  }

  isSubmitted(callId: string): boolean {
    return this.submitted.has(callId);
  }

  // Returns false if already submitted (duplicate delivery — skip it).
  enqueue(callId: string, output: string): boolean {
    if (this.submitted.has(callId)) return false;
    this.submitted.add(callId);
    this.queue.push({ callId, output });
    while (this.queue.length > TOOL_PENDING_QUEUE_CAP) {
      this.queue.shift();
    }
    return true;
  }

  ack(callId: string): void {
    this.queue = this.queue.filter((entry) => entry.callId !== callId);
  }

  drainPending(): readonly QueuedOutput[] {
    const pending = this.queue;
    this.queue = [];
    return pending;
  }

  pendingCallIds(): readonly string[] {
    return this.queue.map((entry) => entry.callId);
  }
}
