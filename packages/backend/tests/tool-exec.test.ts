// S3 tool-exec: domain tool routing + call_id idempotency (frozen section 5).
// Retried/duplicated Voice Live function calls must execute exactly once.

import { afterEach, describe, expect, it } from "vitest";
import { asInterviewId } from "@interview-coach/domain";
import { buildTestBackend, createStartedInterview, seedProblem } from "./helpers.js";
import type { TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

async function toolExec(
  b: TestBackend,
  interviewId: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; json: unknown }> {
  const res = await b.app.inject({
    method: "POST",
    url: `/api/interviews/${interviewId}/tool-exec`,
    payload: body,
  });
  return { statusCode: res.statusCode, json: res.json() as unknown };
}

describe("tool-exec", () => {
  it("dispatches get_interview_state and returns the snapshot", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const { statusCode, json } = await toolExec(backend, id, {
      call_id: "call_state_1",
      tool: "get_interview_state",
    });
    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      callId: "call_state_1",
      tool: "get_interview_state",
      replayed: false,
      result: { status: "in_progress" },
    });
  });

  it("replays the same call_id without re-executing (single tool.invoked event)", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const first = await toolExec(backend, id, { call_id: "call_dup_1", tool: "get_interview_state" });
    const second = await toolExec(backend, id, { call_id: "call_dup_1", tool: "get_interview_state" });
    expect(first.json).toMatchObject({ ok: true, replayed: false });
    expect(second.statusCode).toBe(200);
    expect(second.json).toMatchObject({ ok: true, replayed: true });
    expect((second.json as { result: unknown }).result).toEqual(
      (first.json as { result: unknown }).result,
    );
    const events = await backend.repos.events.listByInterview(asInterviewId(id));
    expect(events.filter((e) => e.type === "tool.invoked")).toHaveLength(1);
  });

  it("shares one execution for concurrent duplicate calls (singleflight)", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const b = backend;
    const [a, c] = await Promise.all([
      toolExec(b, id, { call_id: "call_race_1", tool: "get_candidate_performance" }),
      toolExec(b, id, { call_id: "call_race_1", tool: "get_candidate_performance" }),
    ]);
    expect(a.statusCode).toBe(200);
    expect(c.statusCode).toBe(200);
    const replayed = [a.json, c.json].map((j) => (j as { replayed: boolean }).replayed);
    expect(replayed).toContain(false);
    expect(replayed).toContain(true);
    const events = await b.repos.events.listByInterview(asInterviewId(id));
    expect(events.filter((e) => e.type === "tool.invoked")).toHaveLength(1);
  });

  it("stores permanent failures for replay (no-problem -> 409, retryable:false)", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const first = await toolExec(backend, id, { call_id: "call_noprob_1", tool: "get_current_problem" });
    expect(first.statusCode).toBe(409);
    expect(first.json).toMatchObject({
      ok: false,
      callId: "call_noprob_1",
      error: { code: "NO_CURRENT_PROBLEM", retryable: false },
      replayed: false,
    });
    const second = await toolExec(backend, id, { call_id: "call_noprob_1", tool: "get_current_problem" });
    expect(second.statusCode).toBe(409);
    expect(second.json).toMatchObject({ ok: false, replayed: true });
  });

  it("resolves the current problem after assignment", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos);
    const { id } = await createStartedInterview(backend, ["prob_two-sum"]);
    const { statusCode, json } = await toolExec(backend, id, {
      call_id: "call_prob_1",
      tool: "get_current_problem",
    });
    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      result: { problem: { id: "prob_two-sum", title: "Two Sum" } },
    });
  });

  it("end_interview signals done (in_progress -> completing, idempotent)", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const first = await toolExec(backend, id, { call_id: "call_end_1", tool: "end_interview" });
    expect(first.statusCode).toBe(200);
    expect(first.json).toMatchObject({
      ok: true,
      result: { status: "completing", transitioned: true },
    });
    const second = await toolExec(backend, id, { call_id: "call_end_2", tool: "end_interview" });
    expect(second.json).toMatchObject({ ok: true, result: { status: "completing", transitioned: false } });
  });

  it("validates tool name and call_id with 400", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const badTool = await toolExec(backend, id, { call_id: "call_x", tool: "query_database" });
    expect(badTool.statusCode).toBe(400);
    expect(badTool.json).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    const missingCallId = await toolExec(backend, id, { tool: "get_interview_state" });
    expect(missingCallId.statusCode).toBe(400);
  });

  it("returns 404 for unknown interviews", async () => {
    backend = buildTestBackend();
    const { statusCode } = await toolExec(backend, "iv_missing", {
      call_id: "call_x",
      tool: "get_interview_state",
    });
    expect(statusCode).toBe(404);
  });
});

describe("tool-results recovery", () => {
  it("rehydrates a stored result and 404s unknown call_ids", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    await toolExec(backend, id, { call_id: "call_recover_1", tool: "get_interview_state" });
    const hit = await backend.app.inject({
      method: "GET",
      url: `/api/interviews/${id}/tool-results/call_recover_1`,
    });
    expect(hit.statusCode).toBe(200);
    expect(hit.json()).toMatchObject({ ok: true, callId: "call_recover_1", replayed: true });
    const miss = await backend.app.inject({
      method: "GET",
      url: `/api/interviews/${id}/tool-results/call_unknown`,
    });
    expect(miss.statusCode).toBe(404);
  });

  it("rejects a call_id bound to another interview with 409", async () => {
    backend = buildTestBackend();
    const first = await createStartedInterview(backend);
    const second = await createStartedInterview(backend);
    await toolExec(backend, first.id, { call_id: "call_shared_1", tool: "get_interview_state" });
    const cross = await backend.app.inject({
      method: "GET",
      url: `/api/interviews/${second.id}/tool-results/call_shared_1`,
    });
    expect(cross.statusCode).toBe(409);
    expect(cross.json()).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});
