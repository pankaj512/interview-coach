// CodePanel helper tests (S7b): pure case parsing + run summary. No React,
// no network.
import { describe, expect, it } from "vitest";
import {
  formatRunSummary,
  parseEditableCase,
  type EditableCase,
} from "../src/components/CodePanel.js";
import type { SerializedRun } from "../src/api/types.js";

function row(overrides: Partial<EditableCase> = {}): EditableCase {
  return {
    name: "",
    argsText: "[2, 3]",
    expectedText: "5",
    hidden: false,
    ...overrides,
  };
}

function run(overrides: Partial<SerializedRun> = {}): SerializedRun {
  return {
    id: "run_1",
    submissionId: "sub_1",
    interviewId: "int_1",
    status: "passed",
    results: [],
    passedCount: 2,
    totalCount: 2,
    durationMs: 42,
    createdAt: "2026-09-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseEditableCase", () => {
  it("parses a valid row, defaulting blank names to case_N", () => {
    const parsed = parseEditableCase(row(), 0);
    expect(parsed).toEqual({
      ok: true,
      value: { name: "case_1", args: [2, 3], expected: 5, hidden: false },
    });
  });

  it("keeps explicit names and hidden flags", () => {
    const parsed = parseEditableCase(
      row({ name: " secret ", hidden: true }),
      4,
    );
    expect(parsed).toEqual({
      ok: true,
      value: { name: "secret", args: [2, 3], expected: 5, hidden: true },
    });
  });

  it("rejects non-JSON args and expected with field errors", () => {
    expect(parseEditableCase(row({ argsText: "[1," }), 0)).toMatchObject({
      ok: false,
      error: expect.stringContaining("args is not valid JSON"),
    });
    expect(parseEditableCase(row({ expectedText: "oops" }), 1)).toMatchObject({
      ok: false,
      error: expect.stringContaining("case_2"),
    });
  });

  it("rejects non-array args", () => {
    expect(parseEditableCase(row({ argsText: "5" }), 0)).toMatchObject({
      ok: false,
      error: expect.stringContaining("must be a JSON array"),
    });
  });
});

describe("formatRunSummary", () => {
  it("summarizes status, counts, and duration", () => {
    expect(formatRunSummary(run())).toBe("passed 2/2 in 42ms");
    expect(formatRunSummary(run({ status: "timeout", passedCount: 0, totalCount: 3, durationMs: 5000 }))).toBe(
      "timeout 0/3 in 5000ms",
    );
  });
});
