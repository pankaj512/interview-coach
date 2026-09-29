// CodeWorkspace sample-case parsing (H-Live right panel) plus the pure
// editor-height and pane-split clamps backing the auto-grow editor and the
// draggable problem/editor split.
import { describe, expect, it } from "vitest";
import {
  EDITOR_MIN_HEIGHT,
  clampEditorHeight,
  formatCaseValue,
  sampleCaseFor,
  sampleResultRows,
  starterForLanguage,
} from "../src/components/CodeWorkspace.js";
import { SPLIT_PANE_MIN, clampSplitPct, isRoomVisible, pauseAvailability, shouldNotifyFinished } from "../src/screens/LiveScreen.js";
import { AUTO_FINISH_DELAY_MS, shouldAutoFinish, shouldRefreshOnClose } from "../src/state/use-interview.js";
import type { Problem, ProblemStarterSet, SerializedRun, TestCaseInput } from "../src/api/types.js";

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

describe("isRoomVisible", () => {
  it("keeps the join card on pre-join closed (StrictMode remount cleanup)", () => {
    expect(isRoomVisible("idle", false)).toBe(false);
    expect(isRoomVisible("connecting", false)).toBe(false);
    expect(isRoomVisible("closed", false)).toBe(false);
  });

  it("keeps the room on post-join closed (pause suspend, unexpected close)", () => {
    expect(isRoomVisible("closed", true)).toBe(true);
  });

  it("leaves connected, reconnecting, and failed unchanged", () => {
    expect(isRoomVisible("connected", false)).toBe(true);
    expect(isRoomVisible("reconnecting", false)).toBe(true);
    expect(isRoomVisible("failed", true)).toBe(false);
  });
});

describe("shouldAutoFinish", () => {
  it("fires only from a fresh completing snapshot", () => {
    expect(AUTO_FINISH_DELAY_MS).toBeGreaterThan(0);
    expect(shouldAutoFinish("completing", false, false)).toBe(true);
  });

  it("never refires after a finish or a scheduled beat", () => {
    expect(shouldAutoFinish("completing", true, false)).toBe(false);
    expect(shouldAutoFinish("completing", false, true)).toBe(false);
    expect(shouldAutoFinish("completing", true, true)).toBe(false);
  });

  it("stays quiet for every other status", () => {
    expect(shouldAutoFinish(null, false, false)).toBe(false);
    expect(shouldAutoFinish(undefined, false, false)).toBe(false);
    expect(shouldAutoFinish("in_progress", false, false)).toBe(false);
    expect(shouldAutoFinish("paused", false, false)).toBe(false);
    expect(shouldAutoFinish("completed", false, false)).toBe(false);
  });
});

describe("shouldRefreshOnClose", () => {
  it("refreshes once on an unexpected post-join drop", () => {
    expect(shouldRefreshOnClose("closed", true, false, false, false)).toBe(true);
  });

  it("stays quiet for non-closed connections", () => {
    for (const connection of ["idle", "connecting", "connected", "reconnecting", "failed"] as const) {
      expect(shouldRefreshOnClose(connection, true, false, false, false)).toBe(false);
    }
  });

  it("stays quiet pre-join, after finish, when scheduled, or while suspending", () => {
    expect(shouldRefreshOnClose("closed", false, false, false, false)).toBe(false);
    expect(shouldRefreshOnClose("closed", true, true, false, false)).toBe(false);
    expect(shouldRefreshOnClose("closed", true, false, true, false)).toBe(false);
    expect(shouldRefreshOnClose("closed", true, false, false, true)).toBe(false);
  });
});

describe("shouldNotifyFinished", () => {
  it("notifies once when the auto path flips finished", () => {
    expect(shouldNotifyFinished(true, false)).toBe(true);
  });

  it("stays quiet after the manual path already notified", () => {
    expect(shouldNotifyFinished(true, true)).toBe(false);
  });

  it("stays quiet while the interview is still live", () => {
    expect(shouldNotifyFinished(false, false)).toBe(false);
    expect(shouldNotifyFinished(false, true)).toBe(false);
  });
});

describe("formatCaseValue", () => {
  it("renders missing values as an em dash and strings verbatim", () => {
    expect(formatCaseValue(undefined)).toBe("—");
    expect(formatCaseValue("3")).toBe("3");
  });

  it("renders values as compact JSON", () => {
    expect(formatCaseValue([3, 2, 3])).toBe("[3,2,3]");
    expect(formatCaseValue(null)).toBe("null");
  });
});

describe("sampleResultRows", () => {
  const sample: TestCaseInput = { name: "sample", args: [[3, 2, 3]], expected: 3 };
  const runFor = (results: SerializedRun["results"]): SerializedRun => ({
    id: "run_1",
    submissionId: "sub_1",
    interviewId: "iv_1",
    createdAt: "2026-09-29T00:00:00.000Z",
    status: "passed",
    passedCount: 1,
    totalCount: 1,
    durationMs: 709,
    results,
  });

  it("pairs the sample with its matching result", () => {
    const rows = sampleResultRows(sample, runFor([{ name: "sample", passed: true, hidden: false, actual: 3 }]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "sample", input: "[[3,2,3]]", expected: "3", actual: "3", passed: true });
  });

  it("falls back to the single result when names differ", () => {
    const rows = sampleResultRows(sample, runFor([{ name: "case-0", passed: false, hidden: false, actual: 2, error: "boom" }]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "case-0", expected: "3", passed: false, error: "boom" });
  });

  it("renders zero-result error runs as an empty table, never a bare count", () => {
    expect(sampleResultRows(sample, { ...runFor([]), status: "error", passedCount: 0, totalCount: 0 })).toEqual([]);
  });
});
