import { describe, expect, it } from "vitest";
import { asProblemId } from "../src/ids.js";
import { createProblem } from "../src/problem.js";
import { selectProblemIds, selectProblems } from "../src/selection.js";
import type { Problem } from "../src/problem.js";
import { must } from "./helpers.js";

function problem(
  title: string,
  difficulty: "Easy" | "Medium" | "Hard",
  concepts: readonly string[] = [],
): Problem {
  return must(
    createProblem({
      id: asProblemId(`prob_${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
      title,
      difficulty,
      ...(concepts.length === 0 ? {} : { expectedConcepts: concepts }),
    }),
  );
}

const catalog: readonly Problem[] = [
  problem("Two Sum", "Easy", ["Arrays", "Hash Tables"]),
  problem("3Sum", "Medium", ["Arrays", "Two Pointers"]),
  problem("Median of Two Sorted Arrays", "Hard", ["Arrays", "Binary Search"]),
  problem("Number of Islands", "Medium", ["Depth First Search (DFS)"]),
];

describe("selectProblems", () => {
  it("defaults to one problem, stable order", () => {
    const selected = selectProblems({ problems: catalog });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.title).toBe("Two Sum");
  });

  it("filters by difficulty", () => {
    const selected = selectProblems({ problems: catalog, difficulty: "Medium", count: 10 });
    expect(selected.map((p) => p.title).sort()).toEqual(["3Sum", "Number of Islands"]);
  });

  it("filters by topic focus (case-insensitive)", () => {
    const selected = selectProblems({ problems: catalog, topicFocus: ["dfs"], count: 10 });
    expect(selected.map((p) => p.title)).toEqual(["Number of Islands"]);
  });

  it("honours curriculum order over the default sort", () => {
    const selected = selectProblems({
      problems: catalog,
      count: 2,
      curriculumOrder: ["Number of Islands", "Two Sum", "3Sum"],
    });
    expect(selected.map((p) => p.title)).toEqual(["Number of Islands", "Two Sum"]);
  });

  it("skips excluded ids and clamps count", () => {
    const selected = selectProblemIds({
      problems: catalog,
      count: 100,
      excludeIds: [asProblemId("prob_two-sum")],
    });
    expect(selected).toHaveLength(3);
    expect(selected).not.toContain(asProblemId("prob_two-sum"));
  });

  it("returns empty when nothing matches", () => {
    expect(
      selectProblems({ problems: catalog, topicFocus: ["Quantum"] }),
    ).toHaveLength(0);
  });
});
