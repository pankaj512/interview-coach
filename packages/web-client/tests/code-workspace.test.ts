// CodeWorkspace sample-case parsing (H-Live right panel).
import { describe, expect, it } from "vitest";
import { sampleCaseFor } from "../src/components/CodeWorkspace.js";
import type { Problem } from "../src/api/types.js";

const base: Problem = { id: "p1", title: "Example", difficulty: "Easy" };

describe("sampleCaseFor", () => {
  it("returns null when the problem has no examples", () => {
    expect(sampleCaseFor(null)).toBeNull();
    expect(sampleCaseFor(base)).toBeNull();
  });

  it("parses JSON args and expected", () => {
    const problem: Problem = {
      ...base,
      examples: [{ input: "[2,7,11,15]", output: "[0,1]" }],
    };
    expect(sampleCaseFor(problem)).toEqual({ name: "sample", args: [2, 7, 11, 15], expected: [0, 1] });
  });

  it("wraps non-JSON input as a single string arg", () => {
    const problem: Problem = {
      ...base,
      examples: [{ input: "mat = [[0]]", output: "[[0]]" }],
    };
    // input is not JSON (has a prefix) so it stays a string arg; output parses.
    expect(sampleCaseFor(problem)).toEqual({ name: "sample", args: ["mat = [[0]]"], expected: [[0]] });
  });
});
