// Generic call_id idempotency (frozen section 5).
// One model function call can arrive via multiple Voice Live events, and the
// browser forwarder retries timeouts/network/5xx with the SAME call_id.
// This store guarantees: unseen -> execute once; executing -> singleflight
// share one execution; completed/failed-permanent -> replay stored result.
// Transient throws are NOT stored, so a retry re-executes.
//
// MVP is an in-memory Map (cap ~2000, TTL 30 min, 60 s sweep). Promotion to
// Postgres tool_call_records lands only when multi-instance or restart-safe
// side effects are required (S8).

import { domainError, type DomainError } from "@interview-coach/core";

export interface IdempotentRecord<T> {
  readonly callId: string;
  readonly interviewId: string;
  readonly tool: string;
  readonly ok: boolean;
  readonly result: T | null;
  readonly error: DomainError | null;
  readonly completedAt: number;
}

export interface IdempotencyOutcome<T> {
  readonly record: IdempotentRecord<T>;
  readonly replayed: boolean;
}

export interface IdempotencyStoreOptions {
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly sweepIntervalMs?: number;
}

export class CallIdConflictError extends Error {
  readonly currentInterviewId: string;
  readonly attemptedInterviewId: string;

  constructor(callId: string, currentInterviewId: string, attemptedInterviewId: string) {
    super(
      `call_id ${callId} was already used by a different interview`,
    );
    this.name = "CallIdConflictError";
    this.currentInterviewId = currentInterviewId;
    this.attemptedInterviewId = attemptedInterviewId;
  }

  toDomainError(): DomainError {
    return domainError(
      "CONFLICT",
      `call_id is already bound to another interview`,
      {
        currentInterviewId: this.currentInterviewId,
        attemptedInterviewId: this.attemptedInterviewId,
      },
    );
  }
}

// V3-3: a call_id is bound to the (interviewId, tool) pair, not just the id.
// Reusing it with a different tool name would otherwise replay the first
// tool's result as the second's.
export class CallIdToolMismatchError extends Error {
  readonly callId: string;
  readonly currentTool: string;
  readonly attemptedTool: string;

  constructor(callId: string, currentTool: string, attemptedTool: string) {
    super(`call_id ${callId} was already used by tool ${currentTool}`);
    this.name = "CallIdToolMismatchError";
    this.callId = callId;
    this.currentTool = currentTool;
    this.attemptedTool = attemptedTool;
  }

  toDomainError(): DomainError {
    return domainError("CONFLICT", `call_id is already bound to another tool`, {
      callId: this.callId,
      currentTool: this.currentTool,
      attemptedTool: this.attemptedTool,
    });
  }
}

const DEFAULT_TTL_MS = 30 * 60_000;
const DEFAULT_MAX_ENTRIES = 2000;
const DEFAULT_SWEEP_MS = 60_000;

export class IdempotencyStore<T> {
  private readonly records = new Map<string, IdempotentRecord<T>>();
  // In-flight executions carry their binding too (V3-2/V3-3): the singleflight
  // path must enforce the same cross-interview/cross-tool guarantees as the
  // completed-records path.
  private readonly pending = new Map<
    string,
    { promise: Promise<IdempotentRecord<T>>; interviewId: string; tool: string }
  >();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;

  constructor(options: IdempotencyStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const sweepMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_MS;
    if (sweepMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
      // Never hold the process open for a janitor timer.
      if (typeof this.sweepTimer === "object" && "unref" in this.sweepTimer) {
        (this.sweepTimer as unknown as { unref(): void }).unref();
      }
    } else {
      this.sweepTimer = null;
    }
  }

  get(callId: string): IdempotentRecord<T> | null {
    const record = this.records.get(callId);
    if (record === undefined) return null;
    if (Date.now() - record.completedAt > this.ttlMs) {
      this.records.delete(callId);
      return null;
    }
    return record;
  }

  async execute(
    callId: string,
    interviewId: string,
    tool: string,
    fn: () => Promise<{ ok: boolean; result: T | null; error: DomainError | null }>,
  ): Promise<IdempotencyOutcome<T>> {
    const existing = this.get(callId);
    if (existing !== null) {
      if (existing.interviewId !== interviewId) {
        throw new CallIdConflictError(callId, existing.interviewId, interviewId);
      }
      if (existing.tool !== tool) {
        throw new CallIdToolMismatchError(callId, existing.tool, tool);
      }
      return { record: existing, replayed: true };
    }
    const inFlight = this.pending.get(callId);
    if (inFlight !== undefined) {
      if (inFlight.interviewId !== interviewId) {
        throw new CallIdConflictError(callId, inFlight.interviewId, interviewId);
      }
      if (inFlight.tool !== tool) {
        throw new CallIdToolMismatchError(callId, inFlight.tool, tool);
      }
      return { record: await inFlight.promise, replayed: true };
    }
    const run = (async (): Promise<IdempotentRecord<T>> => {
      const outcome = await fn();
      const record: IdempotentRecord<T> = {
        callId,
        interviewId,
        tool,
        ok: outcome.ok,
        result: outcome.result,
        error: outcome.error,
        completedAt: Date.now(),
      };
      this.put(record);
      return record;
    })();
    this.pending.set(callId, { promise: run, interviewId, tool });
    try {
      return { record: await run, replayed: false };
    } finally {
      this.pending.delete(callId);
    }
  }

  get size(): number {
    return this.records.size;
  }

  close(): void {
    if (this.sweepTimer !== null) clearInterval(this.sweepTimer);
    this.records.clear();
    this.pending.clear();
  }

  private put(record: IdempotentRecord<T>): void {
    while (this.records.size >= this.maxEntries) {
      const oldest = this.records.keys().next();
      if (oldest.done === true) break;
      this.records.delete(oldest.value);
    }
    this.records.set(record.callId, record);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [callId, record] of this.records) {
      if (now - record.completedAt > this.ttlMs) this.records.delete(callId);
    }
  }
}
