import { describe, expect, it } from "vitest";
import { asInterviewId } from "../src/ids.js";
import {
  assembleRun,
  createSubmission,
  parseRunLimits,
  parseTestCases,
  summarizeRun,
} from "../src/submission.js";
import { must, mustErr } from "./helpers.js";

const IV = asInterviewId("iv_sandbox");

describe("createSubmission", () => {
  it("accepts javascript and python", () => {
    for (const language of ["javascript", "python"]) {
      const sub = must(
        createSubmission({ interviewId: IV, language, code: "solve = 1" }),
      );
      expect(sub.language).toBe(language);
      expect(sub.id.startsWith("sub_")).toBe(true);
    }
  });

  it("rejects unknown languages, empty code, and oversized code", () => {
    expect(
      mustErr(
        createSubmission({ interviewId: IV, language: "rust", code: "fn main(){}" }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(createSubmission({ interviewId: IV, language: "python", code: "   " })),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        createSubmission({
          interviewId: IV,
          language: "javascript",
          code: `x = "${"y".repeat(60_000)}"`,
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("parseTestCases", () => {
  it("parses visible and hidden cases", () => {
    const cases = must(
      parseTestCases([
        { name: "basic", args: [[2, 7, 11, 15], 9], expected: [0, 1] },
        { name: "edge", args: [[], 0], expected: [], hidden: true },
      ]),
    );
    expect(cases).toHaveLength(2);
    expect(cases[1]).toMatchObject({ name: "edge", hidden: true });
  });

  it("rejects empty, oversized, unnamed, duplicate, and non-JSON cases", () => {
    expect(mustErr(parseTestCases([]))).toBe("VALIDATION_ERROR");
    expect(mustErr(parseTestCases("nope"))).toBe("VALIDATION_ERROR");
    expect(
      mustErr(parseTestCases([{ args: [], expected: 1 }])),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        parseTestCases([
          { name: "a", args: [], expected: 1 },
          { name: "a", args: [], expected: 2 },
        ]),
      ),
    ).toBe("VALIDATION_ERROR");
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(
      mustErr(parseTestCases([{ name: "c", args: [circular], expected: 1 }])),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        parseTestCases(
          Array.from({ length: 51 }, (_, i) => ({
            name: `t${i}`,
            args: [],
            expected: 0,
          })),
        ),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});

describe("parseRunLimits", () => {
  it("defaults to 5s and clamps 100ms..30s", () => {
    expect(must(parseRunLimits(undefined))).toEqual({ timeoutMs: 5000 });
    expect(must(parseRunLimits(1000)).timeoutMs).toBe(1000);
    expect(mustErr(parseRunLimits(50))).toBe("VALIDATION_ERROR");
    expect(mustErr(parseRunLimits(60_000))).toBe("VALIDATION_ERROR");
    expect(mustErr(parseRunLimits(1.5))).toBe("VALIDATION_ERROR");
  });
});

describe("assembleRun", () => {
  const sub = must(
    createSubmission({ interviewId: IV, language: "javascript", code: "x" }),
  );
  const cases = must(
    parseTestCases([
      { name: "visible", args: [1], expected: 2 },
      { name: "secret", args: [2], expected: 4, hidden: true },
    ]),
  );

  it("passes when every case passes and keeps visible actuals", () => {
    const run = assembleRun(
      sub,
      cases,
      {
        status: "completed",
        results: [
          { name: "visible", passed: true, actual: 2 },
          { name: "secret", passed: true, actual: 4 },
        ],
        durationMs: 12,
      },
    );
    expect(run.status).toBe("passed");
    expect(run.passedCount).toBe(2);
    expect(run.results[0]).toMatchObject({ name: "visible", actual: 2 });
    // Hidden verdict kept, actual masked.
    expect(run.results[1]).toMatchObject({ name: "secret", passed: true });
    expect(run.results[1]).not.toHaveProperty("actual");
    expect(summarizeRun(run)).toMatchObject({
      status: "passed",
      passedCount: 2,
      totalCount: 2,
      passRate: 100,
    });
  });

  it("fails when any case fails and passes timeout/error through", () => {
    const failed = assembleRun(sub, cases, {
      status: "completed",
      results: [
        { name: "visible", passed: false, actual: 3 },
        { name: "secret", passed: true, actual: 4 },
      ],
      durationMs: 9,
    });
    expect(failed.status).toBe("failed");
    expect(summarizeRun(failed).passRate).toBe(50);
    const timedOut = assembleRun(sub, cases, {
      status: "timeout",
      results: [],
      durationMs: 5000,
    });
    expect(timedOut.status).toBe("timeout");
    const errored = assembleRun(sub, cases, {
      status: "error",
      results: [],
      durationMs: 3,
      error: "harness crashed",
    });
    expect(errored.status).toBe("error");
  });
});
