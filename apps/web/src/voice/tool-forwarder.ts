// @interview-coach/web - tool-call forwarder.
//
// Owns: the Voice Live to tool-exec path with 8s timeout, 2 retries,
// backoff, and exactly-once output per call_id. Surprising: only
// timeout/network/5xx retry; 4xx outcomes return as model-facing data.
// Time and jitter are injected so tests need no timers or network.
//
// History: frozen section 5; see docs/SESSION_HANDOFF.md.

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
  // A failure returned as data is retried only when the backend marks it
  // retryable (audit C4-2: 429 RATE_LIMITED retryable:true); domain 4xx stay
  // permanent, model-facing results.
  if (outcome !== undefined && !outcome.ok) return outcome.retryable === true;
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
      // Back off and retry retryable failures (e.g. 429) with the same
      // call_id; permanent failures and success are returned as-is.
      if (!outcome.ok && outcome.retryable && attempts <= maxRetries) {
        await clocks.sleep(backoffMs(attempts - 1, clocks.random));
        continue;
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
// `markSubmitted` returns false when this `call_id` already produced output, so
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

  // Returns false if already submitted (duplicate delivery - skip it).
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
