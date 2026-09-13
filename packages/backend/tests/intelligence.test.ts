// S5 intelligence: problem browser + auto-select + responses + evaluation
// pipeline + extended tool-exec args + structured voice instructions.

import { afterEach, describe, expect, it } from "vitest";
import { asInterviewId } from "@interview-coach/domain";
import { buildTestBackend, createStartedInterview, seedProblem } from "./helpers.js";
import type { TestBackend } from "./helpers.js";

let backend: TestBackend | null = null;
afterEach(async () => {
  if (backend !== null) await backend.app.close();
  backend = null;
});

async function createReadyInterview(b: TestBackend): Promise<string> {
  const created = await b.app.inject({
    method: "POST",
    url: "/api/interviews",
    payload: {
      candidateId: "user_s5",
      configuration: { interviewType: "dsa", difficulty: "Easy", problemCount: 1 },
    },
  });
  const id = (created.json() as { interview: { id: string } }).interview.id;
  await b.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
  return id;
}

describe("S5 problem browser", () => {
  it("lists with difficulty/topic/query filters and pagination", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos, "prob_two-sum", "Two Sum");
    await backend.repos.problems.save({
      id: "prob_3sum" as never,
      title: "3Sum",
      difficulty: "Medium",
    });
    const all = await backend.app.inject({ method: "GET", url: "/api/problems?limit=10" });
    expect(all.statusCode).toBe(200);
    expect((all.json() as { total: number }).total).toBe(2);
    const easy = await backend.app.inject({ method: "GET", url: "/api/problems?difficulty=Easy" });
    expect((easy.json() as { problems: { title: string }[] }).problems.map((p) => p.title)).toEqual([
      "Two Sum",
    ]);
    const query = await backend.app.inject({ method: "GET", url: "/api/problems?q=3sum" });
    expect((query.json() as { problems: { title: string }[] }).problems.map((p) => p.title)).toEqual([
      "3Sum",
    ]);
    const page = await backend.app.inject({ method: "GET", url: "/api/problems?limit=1&offset=1" });
    expect((page.json() as { problems: unknown[] }).problems).toHaveLength(1);
  });

  it("400s unknown difficulty filter", async () => {
    backend = buildTestBackend();
    const res = await backend.app.inject({ method: "GET", url: "/api/problems?difficulty=Impossible" });
    expect(res.statusCode).toBe(400);
  });
});

describe("S5 auto-select", () => {
  it("assigns from configuration when body is empty", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos, "prob_two-sum", "Two Sum");
    const id = await createReadyInterview(backend);
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/problems/select`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      interview: { problems: [{ problemId: "prob_two-sum" }] },
    });
  });

  it("400s when nothing matches", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos, "prob_two-sum", "Two Sum");
    const id = await createReadyInterview(backend);
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/problems/select`,
      payload: { topicFocus: ["Quantum Field Theory"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("409s auto-select on a running interview", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos);
    const { id } = await createStartedInterview(backend);
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/problems/select`,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("S5 responses", () => {
  it("persists candidate answers while running", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/responses`,
      payload: { kind: "approach", content: "Hash map." },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ ok: true, responseCount: 1 });
    const events = await backend.repos.events.listByInterview(asInterviewId(id));
    expect(events.some((e) => e.type === "response.recorded")).toBe(true);
  });

  it("400s empty content", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/responses`,
      payload: { kind: "answer", content: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("S5 evaluation pipeline", () => {
  it("computes score + recommendation when omitted", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/evaluation`,
      payload: {
        dimensions: { correctness: { score: 4 }, approach: { score: 4 } },
        strengths: ["clear"],
        weaknesses: ["edge"],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      ok: true,
      evaluation: { overallScore: 80, recommendation: "lean_hire", hintsUsed: 0 },
    });
  });

  it("I5-1: heavy stored hints downgrade the recommendation on the omitted-hintsUsed path", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos);
    const created = await backend.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/problems`, payload: { problemIds: ["prob_two-sum"] } });
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/start` });
    for (const n of [1, 2, 3]) {
      await backend.app.inject({
        method: "POST",
        url: `/api/interviews/${id}/tool-exec`,
        payload: { call_id: `hint_downgrade_${n}`, tool: "get_problem_hint" },
      });
    }
    // Score 4/5 -> overall 80 -> base lean_hire; 3 stored hints downgrade one tier.
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/evaluation`,
      payload: { dimensions: { correctness: { score: 4 } } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      ok: true,
      evaluation: { overallScore: 80, recommendation: "lean_no_hire", hintsUsed: 3 },
    });
  });

  it("keeps explicit score/recommendation and preserves hint count", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos);
    const created = await backend.app.inject({
      method: "POST",
      url: "/api/interviews",
      payload: { candidateId: "u", configuration: { interviewType: "dsa" } },
    });
    const id = (created.json() as { interview: { id: string } }).interview.id;
    await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/problems`,
      payload: { problemIds: ["prob_two-sum"] },
    });
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/start` });
    await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: { call_id: "hint_keep_1", tool: "get_problem_hint" },
    });
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/evaluation`,
      payload: {
        dimensions: { correctness: { score: 5 } },
        overallScore: 95,
        recommendation: "hire",
      },
    });
    expect(res.json()).toMatchObject({
      ok: true,
      evaluation: { overallScore: 95, recommendation: "hire", hintsUsed: 1 },
    });
  });

  it("records evaluation after completion", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/end` });
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/evaluation`,
      payload: { dimensions: { correctness: { score: 3 } } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ ok: true, evaluation: { overallScore: 60 } });
  });

  it("400s unknown dimension keys", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/evaluation`,
      payload: { dimensions: { telepathy: { score: 5 } } },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("S5 tool-exec extensions", () => {
  it("routes new tools with arguments", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos);
    const { id } = await createStartedInterview(backend, ["prob_two-sum"]);
    const config = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: { call_id: "s5_config_1", tool: "get_interview_configuration" },
    });
    expect(config.statusCode).toBe(200);
    expect(config.json()).toMatchObject({
      ok: true,
      result: { status: "in_progress", currentProblemId: "prob_two-sum" },
    });
    const hint = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: { call_id: "s5_hint_1", tool: "get_problem_hint", arguments: { level: 2 } },
    });
    expect(hint.statusCode).toBe(200);
    expect(hint.json()).toMatchObject({ ok: true, result: { level: 2, hintsUsed: 1 } });
    const answer = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: {
        call_id: "s5_answer_1",
        tool: "record_candidate_answer",
        arguments: { kind: "approach", content: "Two pointers." },
      },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toMatchObject({ ok: true, result: { recorded: true, responseCount: 1 } });
    // Idempotent replay of the hint call.
    const replay = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: { call_id: "s5_hint_1", tool: "get_problem_hint", arguments: { level: 2 } },
    });
    expect(replay.json()).toMatchObject({ ok: true, replayed: true });
  });

  it("surfaces tool argument validation as replayable 400s", async () => {
    backend = buildTestBackend();
    const { id } = await createStartedInterview(backend);
    const res = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/tool-exec`,
      payload: {
        call_id: "s5_badarg_1",
        tool: "record_candidate_answer",
        arguments: { kind: "answer", content: "" },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", retryable: false },
    });
  });
});

describe("S5 structured voice instructions", () => {
  it("embeds configuration, problem, and hint policy", async () => {
    backend = buildTestBackend();
    await seedProblem(backend.repos);
    const { id } = await createStartedInterview(backend, ["prob_two-sum"]);
    const res = await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/voice-session` });
    expect(res.statusCode).toBe(201);
    const instructions = (res.json() as { session: { instructions: string } }).session.instructions;
    expect(instructions).toContain("Two Sum");
    expect(instructions).toContain("get_problem_hint");
    expect(instructions).toContain("record_candidate_answer");
    expect(instructions).toContain("Never reveal");
  });
});
