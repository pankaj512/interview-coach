// S5 voice args: model-supplied function arguments parse + forward.
// No network, no mic.
import { describe, expect, it } from "vitest";
import { forwardToolCall, type ToolExecutor } from "../src/voice/tool-forwarder.js";
import { parseToolArgs } from "../src/voice/voice-client.js";
import type { ToolExecOutcome } from "../src/api/types.js";

function immediateClocks() {
  return { sleep: async () => {}, random: () => 0 };
}

describe("parseToolArgs", () => {
  it("parses argument objects", () => {
    expect(parseToolArgs('{"level":2}')).toEqual({ level: 2 });
    expect(parseToolArgs('{"kind":"approach","content":"x"}')).toEqual({ kind: "approach", content: "x" });
  });

  it("treats empty/missing as no args (backend defaults apply)", () => {
    expect(parseToolArgs(undefined)).toBeUndefined();
    expect(parseToolArgs("")).toBeUndefined();
    expect(parseToolArgs("{}")).toBeUndefined();
    expect(parseToolArgs("  ")).toBeUndefined();
  });

  it("drops malformed or non-object payloads without throwing", () => {
    expect(parseToolArgs("not json")).toBeUndefined();
    expect(parseToolArgs("[1,2]")).toBeUndefined();
    expect(parseToolArgs('"str"')).toBeUndefined();
    expect(parseToolArgs(null)).toBeUndefined();
  });
});

describe("forwardToolCall args", () => {
  it("passes args to the executor on every attempt", async () => {
    const seen: Array<unknown> = [];
    const exec: ToolExecutor = async (callId, tool, _signal, args) => {
      seen.push(args);
      const outcome: ToolExecOutcome = { ok: true, callId, tool, result: {}, replayed: false };
      return outcome;
    };
    const result = await forwardToolCall(exec, "c1", "submit_interview_data", {
      clocks: immediateClocks(),
      args: { kind: "approach", content: "Use a hash map." },
    });
    expect(result.attempts).toBe(1);
    expect(seen).toEqual([{ kind: "approach", content: "Use a hash map." }]);
  });
});
