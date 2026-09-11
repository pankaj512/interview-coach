// BackendClient S5 tests: intelligence endpoints + tool args. Fake fetch,
// no network.
import { describe, expect, it } from "vitest";
import { BackendClient, type FetchFn } from "../src/api/backend-client.js";

function fakeFetch(
  handler: (url: string, init?: { method?: string; body?: string }) => { status: number; body: unknown },
): FetchFn {
  return async (input: string, init?: { method?: string; body?: string }) => ({
    status: handler(input, init).status,
    json: async () => handler(input, init).body,
  });
}

describe("BackendClient S5", () => {
  it("encodes problem-list filters as query params", async () => {
    const seen: string[] = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url) => {
        seen.push(url);
        return { status: 200, body: { problems: [], total: 0, limit: 20, offset: 0 } };
      }),
    );
    const page = await client.listProblems({ difficulty: "Easy", q: "two sum", limit: 10 });
    expect(page.total).toBe(0);
    expect(seen[0]).toContain("/api/problems?");
    expect(seen[0]).toContain("difficulty=Easy");
    expect(seen[0]).toContain("limit=10");
    expect(seen[0]).toContain("q=two+sum");
  });

  it("selects problems and records responses", async () => {
    const bodies: unknown[] = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((_url, init) => {
        bodies.push(init?.body === undefined ? null : JSON.parse(init.body));
        if ((_url as string).includes("/responses")) {
          return { status: 201, body: { ok: true, interview: { id: "int_1" }, responseCount: 2 } };
        }
        return { status: 200, body: { ok: true, interview: { id: "int_1" } } };
      }),
    );
    await client.selectProblems("int_1", { count: 2, difficulty: "Mixed" });
    expect(bodies[0]).toMatchObject({ count: 2, difficulty: "Mixed" });
    const recorded = await client.recordResponse("int_1", { kind: "approach", content: "Two pointers." });
    expect(recorded.responseCount).toBe(2);
    // Note: the fake fetch invokes the handler twice per request (status +
    // body), so the responses payload is the last recorded body.
    expect(bodies[bodies.length - 1]).toMatchObject({ kind: "approach" });
  });

  it("submits evaluations and returns the serialized body", async () => {
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch(() => ({
        status: 201,
        body: {
          ok: true,
          evaluation: {
            id: "eval_1",
            interviewId: "int_1",
            dimensions: { approach: { score: 4 } },
            hintsUsed: 1,
            strengths: [],
            weaknesses: [],
            overallScore: 80,
            recommendation: "lean_hire",
            createdAt: "2026-09-11T00:00:00.000Z",
            updatedAt: "2026-09-11T00:00:00.000Z",
          },
        },
      })),
    );
    const evaluation = await client.submitEvaluation("int_1", {
      dimensions: { approach: { score: 4 } },
    });
    expect(evaluation.overallScore).toBe(80);
    expect(evaluation.recommendation).toBe("lean_hire");
  });

  it("sends tool args as arguments", async () => {
    const bodies: unknown[] = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((_url, init) => {
        bodies.push(init?.body === undefined ? null : JSON.parse(init.body));
        return { status: 200, body: { ok: true, callId: "c1", tool: "get_problem_hint", result: {}, replayed: false } };
      }),
    );
    await client.toolExec("int_1", "c1", "get_problem_hint", undefined, { level: 2 });
    expect(bodies[0]).toMatchObject({ call_id: "c1", tool: "get_problem_hint", arguments: { level: 2 } });
  });

  it("omits arguments when no args are given", async () => {
    const bodies: unknown[] = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((_url, init) => {
        bodies.push(init?.body === undefined ? null : JSON.parse(init.body));
        return { status: 200, body: { ok: true, callId: "c1", tool: "get_interview_state", result: {}, replayed: false } };
      }),
    );
    await client.toolExec("int_1", "c1", "get_interview_state");
    expect(bodies[0]).not.toHaveProperty("arguments");
  });
});
