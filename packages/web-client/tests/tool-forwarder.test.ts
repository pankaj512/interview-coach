// Tool forwarder tests (S4): frozen section 5 retry policy. Fake executor +
// manual clocks, no timers or network.
import { describe, expect, it } from "vitest";
import { BackendApiError } from "../src/api/backend-client.js";
import type { ToolExecOutcome } from "../src/api/types.js";
import {
  backoffMs,
  forwardToolCall,
  isRetryableFailure,
  toFunctionCallOutput,
  ToolOutputLedger,
  type ToolExecutor,
} from "../src/voice/tool-forwarder.js";

function success(callId: string): ToolExecOutcome {
  return { ok: true, callId, tool: "get_interview_state", result: { status: "in_progress" }, replayed: false };
}

function permanent(callId: string): ToolExecOutcome {
  return { ok: false, status: 409, code: "ILLEGAL_TRANSITION", message: "cannot end", retryable: false, callId, tool: "end_interview", replayed: false };
}

function immediateClocks(sleeps: number[]) {
  return { sleep: async (ms: number) => { sleeps.push(ms); }, random: () => 0 };
}

describe("forwardToolCall", () => {
  it("succeeds on the first attempt without sleeping", async () => {
    const seen: string[] = [];
    const exec: ToolExecutor = async (callId) => {
      seen.push(callId);
      return success(callId);
    };
    const sleeps: number[] = [];
    const result = await forwardToolCall(exec, "call_1", "get_interview_state", {
      clocks: immediateClocks(sleeps),
    });
    expect(result.attempts).toBe(1);
    expect(result.retried).toBe(false);
    expect(sleeps).toEqual([]);
    expect(JSON.parse(result.output)).toMatchObject({ call_id: "call_1", result: { status: "in_progress" } });
  });

  it("returns permanent failures as output without retrying", async () => {
    let calls = 0;
    const exec: ToolExecutor = async (callId) => {
      calls += 1;
      return permanent(callId);
    };
    const sleeps: number[] = [];
    const result = await forwardToolCall(exec, "call_9", "end_interview", { clocks: immediateClocks(sleeps) });
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
    expect(JSON.parse(result.output)).toMatchObject({ call_id: "call_9", error: { code: "ILLEGAL_TRANSITION" } });
  });

  it("C4-2: retries a retryable failure outcome (429) with the same call_id", async () => {
    const seen: string[] = [];
    let calls = 0;
    const exec: ToolExecutor = async (callId) => {
      calls += 1;
      seen.push(callId);
      if (calls < 2) {
        return {
          ok: false,
          status: 429,
          code: "RATE_LIMITED",
          message: "slow down",
          retryable: true,
          callId,
          tool: "get_interview_state",
          replayed: false,
        };
      }
      return success(callId);
    };
    const sleeps: number[] = [];
    const result = await forwardToolCall(exec, "call_429", "get_interview_state", {
      clocks: immediateClocks(sleeps),
    });
    expect(result.attempts).toBe(2);
    expect(result.retried).toBe(true);
    expect(seen).toEqual(["call_429", "call_429"]);
    expect(sleeps).toEqual([300]);
  });

  it("C4-2: isRetryableFailure honors the outcome retryable flag", () => {
    expect(isRetryableFailure(new Error("x"), permanent("c"))).toBe(false);
    expect(
      isRetryableFailure(new Error("x"), {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: "slow down",
        retryable: true,
        callId: "c",
        tool: "get_interview_state",
        replayed: false,
      }),
    ).toBe(true);
  });

  it("retries retryable 503s with the same call_id and frozen backoff", async () => {
    const seen: string[] = [];
    let calls = 0;
    const exec: ToolExecutor = async (callId) => {
      calls += 1;
      seen.push(callId);
      if (calls < 3) throw new BackendApiError(503, "SERVER_ERROR", "down", true);
      return success(callId);
    };
    const sleeps: number[] = [];
    const result = await forwardToolCall(exec, "call_2", "get_interview_state", {
      clocks: immediateClocks(sleeps),
    });
    expect(result.attempts).toBe(3);
    expect(result.retried).toBe(true);
    expect(seen).toEqual(["call_2", "call_2", "call_2"]);
    expect(sleeps).toEqual([300, 600]);
  });

  it("gives up after max retries and rethrows", async () => {
    let calls = 0;
    const exec: ToolExecutor = async () => {
      calls += 1;
      throw new BackendApiError(502, "SERVER_ERROR", "bad gateway", true);
    };
    const sleeps: number[] = [];
    await expect(
      forwardToolCall(exec, "call_3", "get_interview_state", { clocks: immediateClocks(sleeps), maxRetries: 2 }),
    ).rejects.toBeInstanceOf(BackendApiError);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([300, 600]);
  });

  it("never retries 400 validation errors", async () => {
    let calls = 0;
    const exec: ToolExecutor = async () => {
      calls += 1;
      throw new BackendApiError(400, "VALIDATION_ERROR", "bad", false);
    };
    const sleeps: number[] = [];
    await expect(
      forwardToolCall(exec, "call_4", "get_interview_state", { clocks: immediateClocks(sleeps) }),
    ).rejects.toBeInstanceOf(BackendApiError);
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("treats aborts (8s timeout) as retryable", async () => {
    let calls = 0;
    const exec: ToolExecutor = (_callId, _tool, signal) => {
      calls += 1;
      return new Promise<ToolExecOutcome>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    };
    const sleeps: number[] = [];
    await expect(
      forwardToolCall(exec, "call_5", "get_interview_state", {
        clocks: immediateClocks(sleeps),
        timeoutMs: 5,
        maxRetries: 1,
      }),
    ).rejects.toThrow();
    expect(calls).toBe(2);
    expect(sleeps).toEqual([300]);
  });
});

describe("isRetryableFailure", () => {
  it("never retries permanent tool outcomes", () => {
    expect(isRetryableFailure(new Error("x"), permanent("c"))).toBe(false);
  });

  it("retries timeout/network/502/503/504, never 4xx", () => {
    expect(isRetryableFailure(new BackendApiError(0, "NETWORK_ERROR", "x", true))).toBe(true);
    expect(isRetryableFailure(new BackendApiError(502, "SERVER_ERROR", "x", true))).toBe(true);
    expect(isRetryableFailure(new BackendApiError(503, "SERVER_ERROR", "x", true))).toBe(true);
    expect(isRetryableFailure(new BackendApiError(504, "SERVER_ERROR", "x", true))).toBe(true);
    expect(isRetryableFailure(new BackendApiError(400, "VALIDATION_ERROR", "x", false))).toBe(false);
    expect(isRetryableFailure(new BackendApiError(404, "NOT_FOUND", "x", false))).toBe(false);
    expect(isRetryableFailure(new BackendApiError(409, "CONFLICT", "x", false))).toBe(false);
  });
});

describe("backoffMs", () => {
  it("ramps 300ms -> 800ms cap plus jitter", () => {
    expect(backoffMs(0, () => 0)).toBe(300);
    expect(backoffMs(1, () => 0)).toBe(600);
    expect(backoffMs(9, () => 0)).toBe(800);
    const jittered = backoffMs(0, () => 0.5);
    expect(jittered).toBeGreaterThanOrEqual(300);
    expect(jittered).toBeLessThan(500);
  });
});

describe("toFunctionCallOutput", () => {
  it("wraps results and errors with the original call_id", () => {
    expect(JSON.parse(toFunctionCallOutput("c1", success("c1")))).toEqual({
      call_id: "c1",
      result: { status: "in_progress" },
    });
    expect(JSON.parse(toFunctionCallOutput("c9", permanent("c9")))).toEqual({
      call_id: "c9",
      error: { code: "ILLEGAL_TRANSITION", message: "cannot end" },
    });
  });
});

describe("ToolOutputLedger", () => {
  it("enforces exactly-once submission per call_id", () => {
    const ledger = new ToolOutputLedger();
    expect(ledger.enqueue("c1", "out")).toBe(true);
    expect(ledger.enqueue("c1", "out")).toBe(false);
    expect(ledger.pendingCount).toBe(1);
    ledger.ack("c1");
    expect(ledger.pendingCount).toBe(0);
    expect(ledger.isSubmitted("c1")).toBe(true);
    expect(ledger.enqueue("c1", "out")).toBe(false);
  });

  it("bounds the unacked queue at 20 entries", () => {
    const ledger = new ToolOutputLedger();
    for (let i = 0; i < 25; i += 1) ledger.enqueue(`c${i}`, "out");
    expect(ledger.pendingCount).toBe(20);
    const drained = ledger.drainPending();
    expect(drained).toHaveLength(20);
    expect(drained[0]?.callId).toBe("c5");
    expect(ledger.pendingCount).toBe(0);
  });
});
