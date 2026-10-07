// Feature 18c: dedicated problem-content endpoint. Enriched problems serve
// the full content slice; title-only gaps return explicit nulls; unknown ids
// 404 and over-long ids 400, mirroring GET /api/problems/:id.

import { afterEach, describe, expect, it } from "vitest";
import { asProblemId } from "@interview-coach/core";
import { buildTestBackend, seedProblem } from "./helpers.js";
import type { TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

function useBackend(): TestBackend {
  backend = buildTestBackend();
  return backend;
}

const ENRICHED_ID = "prob_two-sum";

async function seedEnriched(b: TestBackend): Promise<void> {
  await b.repos.problems.save({
    id: asProblemId(ENRICHED_ID),
    title: "Two Sum",
    difficulty: "Easy",
    description: "Given an array of integers nums and an integer target.",
    constraints: ["2 <= nums.length <= 10^4"],
    examples: [{ input: "nums = [2,7,11,15], target = 9", output: "[0,1]" }],
    starters: {
      cpp: "class Solution {};",
      javascript: "var twoSum = function(nums, target) {};",
      python: "class Solution:\n    def twoSum(self, nums, target): ...",
    },
    runnerLinks: {
      python: {
        runnerId: "shape-014",
        entry: "twoSum",
        className: "Solution",
        actualRule: "pure",
      },
    },
  });
}

describe("problem content endpoint (feature 18c)", () => {
  it("serves the content slice for an enriched problem", async () => {
    const b = useBackend();
    await seedEnriched(b);
    const res = await b.app.inject({ method: "GET", url: `/api/problems/${ENRICHED_ID}/content` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      content: {
        id: ENRICHED_ID,
        title: "Two Sum",
        difficulty: "Easy",
        description: "Given an array of integers nums and an integer target.",
        constraints: ["2 <= nums.length <= 10^4"],
        examples: [{ input: "nums = [2,7,11,15], target = 9", output: "[0,1]" }],
        starters: {
          cpp: "class Solution {};",
          javascript: "var twoSum = function(nums, target) {};",
          python: "class Solution:\n    def twoSum(self, nums, target): ...",
        },
        runnerLinks: {
          python: {
            runnerId: "shape-014",
            entry: "twoSum",
            className: "Solution",
            actualRule: "pure",
          },
        },
      },
    });
  });

  it("returns explicit nulls for a title-only gap problem", async () => {
    const b = useBackend();
    await seedProblem(b.repos);
    const res = await b.app.inject({ method: "GET", url: "/api/problems/prob_two-sum/content" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      content: {
        id: "prob_two-sum",
        title: "Two Sum",
        description: null,
        constraints: null,
        examples: null,
        starters: null,
        runnerLinks: null,
      },
    });
  });

  it("404s for an unknown problem id", async () => {
    const b = useBackend();
    const res = await b.app.inject({ method: "GET", url: "/api/problems/prob_nope/content" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

});
