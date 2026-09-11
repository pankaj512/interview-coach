// BackendClient S7a tests: sandbox endpoints. Fake fetch, no network.
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

const SUBMISSION = {
  id: "sub_1",
  interviewId: "int_1",
  language: "python",
  code: "def solve(x):\n    return x",
  createdAt: "2026-09-11T00:00:00.000Z",
};

const RUN = {
  id: "run_1",
  submissionId: "sub_1",
  interviewId: "int_1",
  status: "passed",
  results: [{ name: "basic", hidden: false, passed: true, actual: 1 }],
  passedCount: 1,
  totalCount: 1,
  durationMs: 9,
  createdAt: "2026-09-11T00:00:00.000Z",
};

describe("BackendClient S7a sandbox", () => {
  it("submits code and lists submissions", async () => {
    const seen: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url, init) => {
        seen.push({
          url,
          method: init?.method,
          body: init?.body === undefined ? null : JSON.parse(init.body),
        });
        if (url.endsWith("/submissions")) {
          return init?.method === "POST"
            ? { status: 201, body: { ok: true, submission: SUBMISSION } }
            : { status: 200, body: { ok: true, submissions: [SUBMISSION] } };
        }
        return { status: 404, body: { ok: false, error: { code: "NOT_FOUND", message: "x", retryable: false } } };
      }),
    );
    const created = await client.submitCode("int_1", {
      language: "python",
      code: SUBMISSION.code,
    });
    expect(created.id).toBe("sub_1");
    expect(seen[0]?.url).toContain("/api/interviews/int_1/submissions");
    expect(seen[0]?.body).toMatchObject({ language: "python" });
    const listed = await client.listSubmissions("int_1");
    expect(listed).toHaveLength(1);
  });

  it("runs a submission and lists/fetches runs", async () => {
    const seen: string[] = [];
    const client = new BackendClient(
      "http://localhost:3000",
      fakeFetch((url) => {
        seen.push(url);
        if (url.includes("/runs/") && !url.endsWith("/runs")) {
          return { status: 200, body: { ok: true, run: RUN } };
        }
        if (url.endsWith("/runs")) {
          return url.includes("/submissions/")
            ? { status: 201, body: { ok: true, run: RUN } }
            : { status: 200, body: { ok: true, runs: [RUN] } };
        }
        return { status: 404, body: { ok: false, error: { code: "NOT_FOUND", message: "x", retryable: false } } };
      }),
    );
    const run = await client.runSubmission("int_1", "sub_1", {
      testCases: [{ name: "basic", args: [1], expected: 1 }],
    });
    expect(run).toMatchObject({ id: "run_1", status: "passed", passedCount: 1 });
    expect(seen[0]).toContain("/api/interviews/int_1/submissions/sub_1/runs");
    expect(await client.listRuns("int_1")).toHaveLength(1);
    expect((await client.getRun("int_1", "run_1")).id).toBe("run_1");
  });
});
