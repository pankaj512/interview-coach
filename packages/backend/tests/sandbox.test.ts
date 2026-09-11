// S7a sandbox routes + local runner (HLD Phase 6): submit code, execute
// against visible/hidden cases, verify verdicts, timeouts, and failures.
// Uses the real LocalCodeRunner via buildTestBackend (node + python3
// subprocesses) — no DB needed.

import { afterEach, describe, expect, it } from "vitest";
import { buildTestBackend, createStartedInterview } from "./helpers.js";
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

const JS_SOLVE = "function solve(a, b) { return a + b; }";
const PY_SOLVE = "def solve(a, b):\n    return a + b";

async function submit(
  b: TestBackend,
  id: string,
  code: string = JS_SOLVE,
  language: string = "javascript",
): Promise<string> {
  const res = await b.app.inject({
    method: "POST",
    url: `/api/interviews/${id}/submissions`,
    payload: { language, code },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { submission: { id: string } }).submission.id;
}

async function run(
  b: TestBackend,
  id: string,
  subId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const res = await b.app.inject({
    method: "POST",
    url: `/api/interviews/${id}/submissions/${subId}/runs`,
    payload: body,
  });
  return { status: res.statusCode, json: res.json() };
}

const CASES = [
  { name: "adds", args: [2, 3], expected: 5 },
  { name: "zero", args: [0, 0], expected: 0 },
];

describe("sandbox submissions", () => {
  it("submits javascript and lists it back", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const subId = await submit(b, id);
    const listed = await b.app.inject({
      method: "GET",
      url: `/api/interviews/${id}/submissions`,
    });
    expect(listed.statusCode).toBe(200);
    expect(
      (listed.json() as { submissions: { id: string }[] }).submissions.map(
        (s) => s.id,
      ),
    ).toEqual([subId]);
  });

  it("rejects unsupported languages and empty code with 400", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    for (const payload of [
      { language: "go", code: "x" },
      { language: "python", code: "" },
    ]) {
      const res = await b.app.inject({
        method: "POST",
        url: `/api/interviews/${id}/submissions`,
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });

  it("rejects submissions for unknown interviews with 404", async () => {
    const b = useBackend();
    const res = await b.app.inject({
      method: "POST",
      url: "/api/interviews/iv_missing/submissions",
      payload: { language: "python", code: "x = 1" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("sandbox runs (local runner)", () => {
  it("passes correct javascript and python", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    for (const [language, code] of [
      ["javascript", JS_SOLVE],
      ["python", PY_SOLVE],
    ] as const) {
      const subId = await submit(b, id, code, language);
      const { status, json } = await run(b, id, subId, { testCases: CASES });
      expect(status).toBe(201);
      expect(json).toMatchObject({
        ok: true,
        run: { status: "passed", passedCount: 2, totalCount: 2 },
      });
    }
  }, 30_000);

  it("fails wrong code and masks hidden actuals", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const subId = await submit(b, id, "function solve(a, b) { return a - b; }");
    const { status, json } = await run(b, id, subId, {
      testCases: [
        { name: "adds", args: [2, 3], expected: 5 },
        { name: "secret", args: [10, 1], expected: 11, hidden: true },
      ],
    });
    expect(status).toBe(201);
    const runResult = (json as { run: { status: string; results: unknown[] } })
      .run;
    expect(runResult.status).toBe("failed");
    const secret = (runResult.results as Record<string, unknown>[]).find(
      (r) => r["name"] === "secret",
    );
    expect(secret).toMatchObject({ passed: false, hidden: true });
    expect(secret).not.toHaveProperty("actual");
  }, 30_000);

  it("records load errors as error runs (missing solve)", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const subId = await submit(b, id, "const x = 1;");
    const { status, json } = await run(b, id, subId, { testCases: CASES });
    expect(status).toBe(201);
    expect(json).toMatchObject({ ok: true, run: { status: "error" } });
  }, 30_000);

  it("kills infinite loops as timeout runs", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const subId = await submit(b, id, "function solve() { while (true) {} }");
    const { status, json } = await run(b, id, subId, {
      testCases: CASES,
      timeoutMs: 500,
    });
    expect(status).toBe(201);
    expect(json).toMatchObject({ ok: true, run: { status: "timeout" } });
  }, 30_000);

  it("rejects cross-interview submissions and bad cases", async () => {
    const b = useBackend();
    const first = await createStartedInterview(b);
    const second = await createStartedInterview(b);
    const subId = await submit(b, first.id, JS_SOLVE);
    const cross = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${second.id}/submissions/${subId}/runs`,
      payload: { testCases: CASES },
    });
    expect(cross.statusCode).toBe(404);
    const bad = await run(b, first.id, subId, { testCases: [] });
    expect(bad.status).toBe(400);
  }, 30_000);

  it("lists runs and fetches one by id", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const subId = await submit(b, id);
    const created = await run(b, id, subId, { testCases: CASES });
    const runId = (
      created.json as { run: { id: string } }
    ).run.id;
    const listed = await b.app.inject({
      method: "GET",
      url: `/api/interviews/${id}/runs`,
    });
    expect(listed.statusCode).toBe(200);
    expect(
      (listed.json() as { runs: { id: string }[] }).runs.map((r) => r.id),
    ).toEqual([runId]);
    const fetched = await b.app.inject({
      method: "GET",
      url: `/api/interviews/${id}/runs/${runId}`,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({
      ok: true,
      run: { id: runId, status: "passed" },
    });
    const missing = await b.app.inject({
      method: "GET",
      url: `/api/interviews/${id}/runs/run_missing`,
    });
    expect(missing.statusCode).toBe(404);
  }, 30_000);
});

describe("sandbox tools via tool-exec", () => {
  async function toolExec(
    b: TestBackend,
    id: string,
    tool: string,
    args?: Record<string, unknown>,
  ): Promise<{ status: number; json: unknown }> {
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: {
        call_id: `call_${tool}_${Math.random().toString(36).slice(2)}`,
        tool,
        ...(args === undefined ? {} : { arguments: args }),
      },
    });
    return { status: res.statusCode, json: res.json() };
  }

  it("submit_solution + run_code + performance surfaces sandbox state", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const submitted = await toolExec(b, id, "submit_solution", {
      language: "python",
      code: PY_SOLVE,
    });
    expect(submitted.status).toBe(200);
    const submissionId = (
      submitted.json as { result: { submissionId: string } }
    ).result.submissionId;
    expect(submissionId.startsWith("sub_")).toBe(true);

    const executed = await toolExec(b, id, "run_code", {
      testCases: [{ name: "adds", args: [2, 3], expected: 5 }],
    });
    expect(executed.status).toBe(200);
    expect(executed.json).toMatchObject({
      ok: true,
      result: { submissionId, status: "passed" },
    });

    const perf = await toolExec(b, id, "get_candidate_performance");
    expect(perf.json).toMatchObject({
      ok: true,
      result: { submissionCount: 1, lastRunStatus: "passed" },
    });
  }, 30_000);

  it("run_code without submissions is a permanent NOT_FOUND", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    const res = await toolExec(b, id, "run_code", {
      testCases: [{ name: "t", args: [], expected: 0 }],
    });
    expect(res.status).toBe(404);
    expect(res.json).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND", retryable: false },
    });
  });
});

describe("voice-session sandbox context", () => {
  it("advertises submit/run tools and code progress in instructions", async () => {
    const b = useBackend();
    const { id } = await createStartedInterview(b);
    await submit(b, id, JS_SOLVE);
    const res = await b.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/voice-session`,
    });
    expect(res.statusCode).toBe(201);
    const session = (res.json() as { session: Record<string, unknown> }).session;
    const instructions = session["instructions"] as string;
    expect(instructions).toContain("submit_solution");
    expect(instructions).toContain("run_code");
    expect(instructions).toContain("1 submission, not run yet");
  });
});
