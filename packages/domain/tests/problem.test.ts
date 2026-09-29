// createProblem starters/runnerLinks passthrough (F-07): the enrichment
// payload the seed builds must survive the domain constructor verbatim,
// including method-sequence links whose entry is "".
import { describe, expect, it } from "vitest";
import { createProblem } from "../src/problem.js";

describe("createProblem starters/runnerLinks passthrough", () => {
  it("carries starters and all three language links verbatim", () => {
    const created = createProblem({
      title: "Passthrough",
      difficulty: "Easy",
      starters: { cpp: "cpp-stub", javascript: "js-stub", python: "py-stub" },
      runnerLinks: {
        python: {
          runnerId: "method-sequence",
          entry: "",
          className: "LRUCache",
          actualRule: "method-sequence",
        },
        javascript: {
          runnerId: "shape-001",
          entry: "solve",
          className: "Solution",
          actualRule: "pure",
        },
        cpp: {
          runnerId: "shape-001",
          entry: "solve",
          className: "Solution",
          actualRule: "pure",
        },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.starters).toEqual({
      cpp: "cpp-stub",
      javascript: "js-stub",
      python: "py-stub",
    });
    expect(created.value.runnerLinks?.python?.entry).toBe("");
    expect(created.value.runnerLinks?.javascript?.entry).toBe("solve");
    expect(created.value.runnerLinks?.cpp?.actualRule).toBe("pure");
  });
});
