import { describe, expect, it } from "vitest";
import { asProblemId } from "../src/ids.js";
import { createProblem } from "../src/problem.js";
import { buildHint, nextHintLevel, parseHintLevel } from "../src/hints.js";
import { must } from "./helpers.js";

const problem = must(
  createProblem({
    id: asProblemId("prob_two-sum"),
    title: "Two Sum",
    difficulty: "Easy",
    expectedConcepts: ["Arrays", "Hash Tables"],
    constraints: ["2 <= nums.length <= 10^4"],
  }),
);

describe("hint policy", () => {
  it("escalates levels then caps at 3", () => {
    expect(nextHintLevel(0)).toBe(1);
    expect(nextHintLevel(1)).toBe(2);
    expect(nextHintLevel(2)).toBe(3);
    expect(nextHintLevel(9)).toBe(3);
    expect(nextHintLevel(-1)).toBe(1);
  });

  it("parses explicit levels strictly", () => {
    expect(parseHintLevel(2)).toBe(2);
    expect(parseHintLevel("3")).toBe(3);
    expect(parseHintLevel(4)).toBeNull();
    expect(parseHintLevel("hint")).toBeNull();
    expect(parseHintLevel(undefined)).toBeNull();
  });

  it("builds tiered hints that never reveal the solution", () => {
    const h1 = buildHint(problem, 1);
    const h2 = buildHint(problem, 2);
    const h3 = buildHint(problem, 3);
    expect(h1.revealsSolution).toBe(false);
    expect(h2.revealsSolution).toBe(false);
    expect(h3.revealsSolution).toBe(false);
    expect(h1.hint).toContain("Two Sum");
    expect(h1.hint).not.toEqual(h2.hint);
    expect(h2.hint).not.toEqual(h3.hint);
    for (const h of [h1, h2, h3]) {
      expect(h.hint.toLowerCase()).not.toContain("final code");
    }
  });
});
