// BackendClient 18c tests: problem-content fetch contract. Fake fetch,
// no network.
import { describe, expect, it } from "vitest";
import { BackendClient, type FetchFn } from "../src/api/backend-client.js";

function fakeFetch(
  handler: (url: string) => { status: number; body: unknown },
): FetchFn {
  return async (input: string) => ({
    status: handler(input).status,
    json: async () => handler(input).body,
  });
}

describe("BackendClient problem content", () => {
  it("fetches the content slice for an enriched problem", async () => {
    const seen: string[] = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url) => {
        seen.push(url);
        return {
          status: 200,
          body: {
            ok: true,
            content: {
              description: "Given an array...",
              constraints: ["1 <= n"],
              examples: [{ input: "nums = [1]", output: "[1]" }],
              starters: { cpp: "// c", javascript: "// j", python: "# p" },
              runnerLinks: {
                python: {
                  runnerId: "shape-048",
                  entry: "moveZeroes",
                  className: "Solution",
                  actualRule: "in-place",
                },
              },
            },
          },
        };
      }),
    );
    const content = await client.getProblemContent("prob_move-zeroes");
    expect(seen[0]).toContain("/api/problems/prob_move-zeroes/content");
    expect(content.description).toBe("Given an array...");
    expect(content.constraints).toEqual(["1 <= n"]);
    expect(content.examples).toHaveLength(1);
    expect(content.starters?.python).toBe("# p");
    expect(content.runnerLinks?.python?.runnerId).toBe("shape-048");
  });

  it("preserves nulls for a title-only gap problem", async () => {
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch(() => ({
        status: 200,
        body: {
          ok: true,
          content: {
            description: null,
            constraints: null,
            examples: null,
            starters: null,
            runnerLinks: null,
          },
        },
      })),
    );
    const content = await client.getProblemContent("prob_guess-the-word");
    expect(content.description).toBeNull();
    expect(content.starters).toBeNull();
    expect(content.runnerLinks).toBeNull();
  });
});
