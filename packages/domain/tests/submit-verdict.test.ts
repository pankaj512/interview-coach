// Feature 18d: submit-verdict proposal + input validation.

import { describe, expect, it } from "vitest";
import {
  validateSubmitVerdictInput,
  validateSubmitVerdictProposal,
} from "../src/index.js";

function validProposal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    correctness: "correct",
    correctnessNotes: "handles all cases",
    optimality: "O(n) time, O(1) space",
    optimalityNotes: "optimal",
    breakPoints: ["empty input"],
    edgeCases: ["single element"],
    summary: "solid solution",
    ...overrides,
  };
}

describe("validateSubmitVerdictProposal", () => {
  it("accepts a valid verdict and trims notes", () => {
    const proposal = validateSubmitVerdictProposal(
      validProposal({ summary: "  solid  " }),
    );
    expect(proposal).not.toBeNull();
    expect(proposal?.correctness).toBe("correct");
    expect(proposal?.summary).toBe("solid");
    expect(proposal?.breakPoints).toEqual(["empty input"]);
  });

  it("accepts empty break-points and edge cases", () => {
    const proposal = validateSubmitVerdictProposal(validProposal({ breakPoints: [], edgeCases: [] }));
    expect(proposal?.breakPoints).toEqual([]);
    expect(proposal?.edgeCases).toEqual([]);
  });

  it("rejects each malformed class", () => {
    expect(validateSubmitVerdictProposal(validProposal({ correctness: "maybe" }))).toBeNull();
    expect(validateSubmitVerdictProposal(validProposal({ summary: "   " }))).toBeNull();
    const { summary, ...missing } = validProposal();
    expect(validateSubmitVerdictProposal(missing)).toBeNull();
    expect(validateSubmitVerdictProposal(validProposal({ breakPoints: "nope" }))).toBeNull();
    expect(validateSubmitVerdictProposal(validProposal({ edgeCases: [42] }))).toBeNull();
    expect(validateSubmitVerdictProposal(validProposal({ optimality: 7 }))).toBeNull();
    expect(validateSubmitVerdictProposal(null)).toBeNull();
    expect(validateSubmitVerdictProposal([])).toBeNull();
  });
});

describe("validateSubmitVerdictInput", () => {
  it("accepts a valid input with and without a problem", () => {
    const base = {
      interviewId: "iv_1",
      language: "python",
      code: "x = 1",
      problem: { id: "p1", title: "T", statement: "S", constraints: "C" },
    };
    expect(validateSubmitVerdictInput(base)?.language).toBe("python");
    expect(validateSubmitVerdictInput({ ...base, problem: null })?.problem).toBeNull();
    expect(validateSubmitVerdictInput({ ...base, problem: undefined })?.problem).toBeNull();
  });

  it("enforces the code-length cap", () => {
    const base = { interviewId: "iv_1", language: "python", problem: null };
    expect(validateSubmitVerdictInput({ ...base, code: "x".repeat(50_000) })?.code).toHaveLength(50_000);
    expect(validateSubmitVerdictInput({ ...base, code: "x".repeat(50_001) })).toBeNull();
    expect(validateSubmitVerdictInput({ ...base, code: "   " })).toBeNull();
  });

  it("rejects bad language, id, and problem shapes", () => {
    const base = { interviewId: "iv_1", language: "python", code: "x = 1", problem: null };
    expect(validateSubmitVerdictInput({ ...base, language: "ruby" })).toBeNull();
    expect(validateSubmitVerdictInput({ ...base, interviewId: "" })).toBeNull();
    expect(
      validateSubmitVerdictInput({
        ...base,
        problem: { id: "p1", title: "T", statement: "S", constraints: "" },
      }),
    ).toBeNull();
  });
});
