import { describe, expect, it } from "vitest";
import {
  importCatalogProblem,
  importCatalogTopics,
  problemIdForTitle,
} from "../src/catalog.js";
import { parseDifficulty } from "../src/problem.js";
import { must, mustErr } from "./helpers.js";

describe("catalog import", () => {
  it("imports topics into Problems with stable ids", () => {
    const { problems, errors } = importCatalogTopics([
      {
        topic: "Arrays",
        problems: [
          {
            title: "Move Zeroes",
            difficulty: "Easy",
            DSA: "https://DSA.io/practice/dsa/move-zeroes?list=am-300",
            leetcode: "https://leetcode.com/problems/move-zeroes",
          },
          { title: "Rotate Array", difficulty: "Medium" },
        ],
      },
    ]);
    expect(errors).toEqual([]);
    expect(problems).toHaveLength(2);
    expect(problems[0]?.id).toBe("prob_move-zeroes");
    expect(problems[0]?.expectedConcepts).toEqual(["Arrays"]);
    expect(problems[0]?.sourceLinks?.leetcode).toContain("move-zeroes");
    expect(problems[1]?.id).toBe("prob_rotate-array");
    expect(problemIdForTitle("Move Zeroes")).toBe(problems[0]?.id);
  });

  it("collects invalid difficulties and duplicates as errors", () => {
    const { problems, errors } = importCatalogTopics([
      {
        topic: "Arrays",
        problems: [{ title: "Move Zeroes", difficulty: "Easy" }],
      },
      {
        topic: "Strings",
        problems: [
          { title: "Move Zeroes", difficulty: "Easy" },
          { title: "Mystery", difficulty: "Nightmare" },
        ],
      },
    ]);
    expect(problems).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain("Duplicate");
    expect(errors[1]?.title).toBe("Mystery");
  });

  it("parseDifficulty accepts only the catalog levels", () => {
    expect(must(parseDifficulty("Hard"))).toBe("Hard");
    expect(mustErr(parseDifficulty("nightmare"))).toBe("VALIDATION_ERROR");
  });

  it("importCatalogProblem reports the topic on failure", () => {
    const result = importCatalogProblem("Graphs", {
      title: "X",
      difficulty: "bogus",
    });
    expect(mustErr(result)).toBe("VALIDATION_ERROR");
  });
});
