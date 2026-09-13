// S3 idempotency store unit tests (frozen section 5 defaults).

import { describe, expect, it } from "vitest";
import { domainError } from "@interview-coach/domain";
import {
  CallIdConflictError,
  CallIdToolMismatchError,
  IdempotencyStore,
} from "../src/idempotency.js";

const okResult = { ok: true as const, result: { status: "in_progress" }, error: null };

describe("IdempotencyStore", () => {
  it("executes unseen call_ids once and replays", async () => {
    const store = new IdempotencyStore<{ status: string }>({ sweepIntervalMs: 0 });
    let executions = 0;
    const fn = async () => {
      executions += 1;
      return okResult;
    };
    const first = await store.execute("c1", "iv_1", "get_interview_state", fn);
    const second = await store.execute("c1", "iv_1", "get_interview_state", fn);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(executions).toBe(1);
    expect(second.record.result).toEqual({ status: "in_progress" });
    store.close();
  });

  it("shares in-flight executions (singleflight)", async () => {
    const store = new IdempotencyStore<{ status: string }>({ sweepIntervalMs: 0 });
    let executions = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fn = async () => {
      executions += 1;
      await gate;
      return okResult;
    };
    const p1 = store.execute("c2", "iv_1", "get_interview_state", fn);
    const p2 = store.execute("c2", "iv_1", "get_interview_state", fn);
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(executions).toBe(1);
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    store.close();
  });

  it("does not store transient throws, so retries re-execute", async () => {
    const store = new IdempotencyStore<{ status: string }>({ sweepIntervalMs: 0 });
    let attempts = 0;
    const flaky = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("db down");
      return okResult;
    };
    await expect(store.execute("c3", "iv_1", "get_interview_state", flaky)).rejects.toThrow("db down");
    const retry = await store.execute("c3", "iv_1", "get_interview_state", flaky);
    expect(retry.replayed).toBe(false);
    expect(attempts).toBe(2);
    store.close();
  });

  it("rejects cross-interview call_id reuse with CONFLICT", async () => {
    const store = new IdempotencyStore<{ status: string }>({ sweepIntervalMs: 0 });
    await store.execute("c4", "iv_1", "get_interview_state", async () => okResult);
    await expect(
      store.execute("c4", "iv_2", "get_interview_state", async () => okResult),
    ).rejects.toBeInstanceOf(CallIdConflictError);
    store.close();
  });

  it("V3-3: rejects a call_id reused with a different tool", async () => {
    const store = new IdempotencyStore<{ status: string }>({ sweepIntervalMs: 0 });
    await store.execute("c6", "iv_1", "get_interview_state", async () => okResult);
    await expect(
      store.execute("c6", "iv_1", "get_current_problem", async () => okResult),
    ).rejects.toBeInstanceOf(CallIdToolMismatchError);
    store.close();
  });

  it("V3-2: singleflight enforces the interview binding while in flight", async () => {
    const store = new IdempotencyStore<{ status: string }>({ sweepIntervalMs: 0 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const p1 = store.execute("c7", "iv_1", "get_interview_state", async () => {
      await gate;
      return okResult;
    });
    await expect(
      store.execute("c7", "iv_2", "get_interview_state", async () => okResult),
    ).rejects.toBeInstanceOf(CallIdConflictError);
    release();
    await p1;
    store.close();
  });

  it("V3-2: singleflight rejects a different tool while in flight", async () => {
    const store = new IdempotencyStore<{ status: string }>({ sweepIntervalMs: 0 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const p1 = store.execute("c8", "iv_1", "get_interview_state", async () => {
      await gate;
      return okResult;
    });
    await expect(
      store.execute("c8", "iv_1", "get_current_problem", async () => okResult),
    ).rejects.toBeInstanceOf(CallIdToolMismatchError);
    release();
    await p1;
    store.close();
  });

  it("expires records after the TTL", async () => {
    const store = new IdempotencyStore<unknown>({ ttlMs: 20, sweepIntervalMs: 0 });
    await store.execute("c5", "iv_1", "t", async () => ({
      ok: false as const,
      result: null,
      error: domainError("NOT_FOUND", "gone"),
    }));
    expect(store.get("c5")).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(store.get("c5")).toBeNull();
    store.close();
  });

  it("evicts oldest entries past the cap", async () => {
    const store = new IdempotencyStore<unknown>({ maxEntries: 2, sweepIntervalMs: 0 });
    for (const callId of ["e1", "e2", "e3"]) {
      await store.execute(callId, "iv_1", "t", async () => okResult);
    }
    expect(store.size).toBe(2);
    expect(store.get("e1")).toBeNull();
    expect(store.get("e3")).not.toBeNull();
    store.close();
  });
});
