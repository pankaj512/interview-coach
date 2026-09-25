// CodeWorkspace sample-case parsing (H-Live right panel) plus the pure
// editor-height and pane-split clamps backing the auto-grow editor and the
// draggable problem/editor split.
import { describe, expect, it } from "vitest";
import {
  EDITOR_MIN_HEIGHT,
  clampEditorHeight,
  sampleCaseFor,
  starterForLanguage,
} from "../src/components/CodeWorkspace.js";
import { SPLIT_PANE_MIN, clampSplitPct, pauseAvailability } from "../src/screens/LiveScreen.js";
import type { Problem, ProblemStarterSet } from "../src/api/types.js";

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

describe("starterForLanguage", () => {
  const starters: ProblemStarterSet = {
    cpp: "class Solution {};",
    javascript: "var solve = function() {};",
    python: "class Solution:",
  };

  it("returns the verbatim starter for the active language", () => {
    expect(starterForLanguage(starters, "python")).toBe("class Solution:");
    expect(starterForLanguage(starters, "javascript")).toBe("var solve = function() {};");
    expect(starterForLanguage(starters, "cpp")).toBe("class Solution {};");
  });

  it("returns null for title-only gaps and unloaded content", () => {
    expect(starterForLanguage(null, "python")).toBeNull();
    expect(starterForLanguage(undefined, "python")).toBeNull();
  });
});

describe("clampEditorHeight", () => {
  it("starts at the room minimum and grows with content", () => {
    expect(EDITOR_MIN_HEIGHT).toBe(480);
    expect(clampEditorHeight(100, 900)).toBe(480);
    expect(clampEditorHeight(600, 900)).toBe(600);
  });

  it("caps at the viewport budget so the Test row stays visible", () => {
    expect(clampEditorHeight(1200, 700)).toBe(700);
  });

  it("never collapses below the minimum on short viewports", () => {
    expect(clampEditorHeight(1200, 200)).toBe(480);
  });
});

describe("clampSplitPct", () => {
  it("keeps the 300px floor on both panes of a wide room", () => {
    expect(SPLIT_PANE_MIN).toBe(300);
    // 1200px room: 300px floor = 25% from either edge.
    expect(clampSplitPct(55, 1200)).toBe(55);
    expect(clampSplitPct(5, 1200)).toBe(25);
    expect(clampSplitPct(99, 1200)).toBe(75);
  });

  it("settles at the middle when the room is narrower than both floors", () => {
    expect(clampSplitPct(55, 400)).toBe(50);
  });
});

describe("pauseAvailability", () => {
  it("allows the attempt while the snapshot is still loading", () => {
    expect(pauseAvailability(null)).toBe("pausable");
    expect(pauseAvailability(undefined)).toBe("pausable");
  });

  it("pauses from in_progress and resumes from paused", () => {
    expect(pauseAvailability("in_progress")).toBe("pausable");
    expect(pauseAvailability("paused")).toBe("resumable");
  });

  it("blocks pause and resume once the interview drifts or ends", () => {
    expect(pauseAvailability("completing")).toBe("unavailable");
    expect(pauseAvailability("completed")).toBe("unavailable");
    expect(pauseAvailability("cancelled")).toBe("unavailable");
    expect(pauseAvailability("failed")).toBe("unavailable");
    expect(pauseAvailability("created")).toBe("unavailable");
    expect(pauseAvailability("ready")).toBe("unavailable");
  });
});
