// S2 persistence tests (HLD Phase 2 exit):
// process restart must not destroy authoritative interview state.
// Requires Postgres (`docker compose up db`, migrations applied).
// Warn-and-pass without a DB so plain `pnpm test` stays green.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InterviewService,
  SubmissionService,
  asUserId,
  createProblem,
  type Problem,
} from "@interview-coach/domain";
import { createDatabase } from "../src/client.js";
import { createDrizzleRepositories } from "../src/repositories.js";
import { connectTestDb, withDb, type TestContext } from "./helpers.js";

const ctx: { current: TestContext | null } = { current: null };

beforeAll(async () => {
  ctx.current = await connectTestDb();
});

afterAll(async () => {
  await ctx.current?.handle.close();
});

function mustProblem(title: string): Problem {
  const created = createProblem({ title, difficulty: "Easy" });
  if (!created.ok) throw new Error("fixture problem invalid");
  return created.value;
}

describe("postgres persistence", () => {
  it("round-trips problems (save/find/list/findManyByIds order)", withDb(ctx, async (t) => {
    const a = mustProblem("Two Sum Persisted");
    const b = mustProblem("Reverse String Persisted");
    await t.repos.problems.save(a);
    await t.repos.problems.save(b);

    expect(await t.repos.problems.findById(a.id)).toEqual(a);
    expect(await t.repos.problems.list()).toHaveLength(2);
    // findManyByIds preserves input order, skips missing.
    const many = await t.repos.problems.findManyByIds([b.id, a.id]);
    expect(many.map((p) => p.id)).toEqual([b.id, a.id]);
  }));

  it("runs the full interview lifecycle on Postgres repos", withDb(ctx, async (t) => {
    const service = new InterviewService({ ...t.repos });
    const p1 = mustProblem("Lifecycle P1");
    const p2 = mustProblem("Lifecycle P2");
    await t.repos.problems.save(p1);
    await t.repos.problems.save(p2);

    const created = await service.createInterview({
      candidateId: asUserId("user_lifecycle"),
      configuration: { interviewType: "dsa" },
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.id;

    for (const step of [
      () => service.markReady(id),
      () => service.assignProblems(id, [p1.id, p2.id]),
      () => service.start(id),
    ] as const) {
      const r = await step();
      if (!r.ok) throw new Error(r.error.message);
    }
    const recorded = await service.recordResponse(id, {
      kind: "approach",
      content: "Two pointers",
    });
    if (!recorded.ok) throw new Error(recorded.error.message);

    const state = await service.getState(id);
    if (!state.ok) throw new Error(state.error.message);
    expect(state.value.interview.status).toBe("in_progress");
    expect(state.value.currentProblem?.id).toBe(p1.id);
    expect(state.value.responseCount).toBe(1);

    const done = await service.beginCompleting(id);
    if (!done.ok) throw new Error(done.error.message);
    expect(done.value.status).toBe("completing");
  }));

  it("survives a process restart (close + reconnect)", withDb(ctx, async (t) => {
    const service = new InterviewService({ ...t.repos });
    const p = mustProblem("Restart Problem");
    await t.repos.problems.save(p);

    const created = await service.createInterview({
      candidateId: asUserId("user_restart"),
      configuration: { interviewType: "dsa", difficulty: "Easy" },
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.id;
    for (const step of [
      () => service.markReady(id),
      () => service.assignProblems(id, [p.id]),
      () => service.start(id),
    ] as const) {
      const r = await step();
      if (!r.ok) throw new Error(r.error.message);
    }
    const resp = await service.recordResponse(id, {
      kind: "answer",
      content: "O(n) hash map",
    });
    if (!resp.ok) throw new Error(resp.error.message);
    const evaled = await service.recordEvaluation(id, {
      hintsUsed: 1,
      strengths: ["clear approach"],
      recommendation: "lean_hire",
    });
    if (!evaled.ok) throw new Error(evaled.error.message);

    // Simulate a process restart: drop every connection, reconnect fresh.
    await t.handle.close();
    const fresh = createDatabase();
    try {
      const repos = createDrizzleRepositories(fresh.db);
      const resumed = new InterviewService({ ...repos });

      const state = await resumed.getState(id);
      if (!state.ok) throw new Error(state.error.message);
      expect(state.value.interview.status).toBe("in_progress");
      expect(state.value.currentProblem?.title).toBe("Restart Problem");
      expect(state.value.responseCount).toBe(1);
      expect(state.value.evaluation?.recommendation).toBe("lean_hire");

      const events = await repos.events.listByInterview(id);
      expect(events.length).toBeGreaterThan(0);

      // Lifecycle still advances after the restart.
      const completing = await resumed.beginCompleting(id);
      if (!completing.ok) throw new Error(completing.error.message);
      expect(completing.value.status).toBe("completing");
    } finally {
      await fresh.close();
    }

    // Reconnect the shared context handle for subsequent tests/cleanup.
    const reconnected = await connectTestDb();
    if (reconnected === null) throw new Error("DB vanished mid-test");
    ctx.current = reconnected;
  }));

  it("round-trips submissions and runs, surviving restart", withDb(ctx, async (t) => {
    const service = new InterviewService({ ...t.repos });
    const submissions = new SubmissionService({
      interviews: service,
      submissions: t.repos.submissions,
      runs: t.repos.runs,
      events: t.repos.events,
      executor: {
        execute: async (_sub, cases) => ({
          status: "completed",
          results: cases.map((c) => ({
            name: c.name,
            passed: true,
            actual: c.expected,
          })),
          durationMs: 7,
        }),
      },
    });
    const created = await service.createInterview({
      candidateId: asUserId("user_sandbox"),
      configuration: { interviewType: "dsa" },
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.id;
    for (const step of [
      () => service.markReady(id),
      () => service.start(id),
    ] as const) {
      const r = await step();
      if (!r.ok) throw new Error(r.error.message);
    }
    const sub = await submissions.submit(id, {
      language: "python",
      code: "def solve(x):\n    return x",
    });
    if (!sub.ok) throw new Error(sub.error.message);
    const run = await submissions.runTests(sub.value.id, [
      { name: "basic", args: [1], expected: 1 },
    ]);
    if (!run.ok) throw new Error(run.error.message);
    expect(run.value.status).toBe("passed");

    await t.handle.close();
    const fresh = createDatabase();
    try {
      const repos = createDrizzleRepositories(fresh.db);
      expect((await repos.submissions.listByInterview(id)).map((s) => s.id)).toEqual([
        sub.value.id,
      ]);
      const runs = await repos.runs.listByInterview(id);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ status: "passed", passedCount: 1 });
      expect(await repos.runs.listBySubmission(sub.value.id)).toHaveLength(1);
    } finally {
      await fresh.close();
    }

    const reconnected = await connectTestDb();
    if (reconnected === null) throw new Error("DB vanished mid-test");
    ctx.current = reconnected;
  }));

  it("hard-deletes an interview with all scoped artefacts cascading", withDb(ctx, async (t) => {
    const service = new InterviewService({ ...t.repos });
    const p = mustProblem("Delete Cascade Problem");
    await t.repos.problems.save(p);

    const created = await service.createInterview({
      candidateId: asUserId("user_delete"),
      configuration: { interviewType: "dsa" },
    });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.value.id;
    for (const step of [
      () => service.markReady(id),
      () => service.assignProblems(id, [p.id]),
      () => service.start(id),
      () => service.recordResponse(id, { kind: "answer", content: "gone" }),
      () => service.recordEvaluation(id, { hintsUsed: 0, strengths: ["s"] }),
      () => service.beginCompleting(id),
      () => service.complete(id),
    ] as const) {
      const r = await step();
      if (!r.ok) throw new Error(r.error.message);
    }
    const deleted = await service.deleteInterview(id);
    if (!deleted.ok) throw new Error(deleted.error.message);
    expect(deleted.value).toMatchObject({ id, status: "completed" });

    expect(await t.repos.interviews.findById(id)).toBeNull();
    expect(await t.repos.responses.listByInterview(id)).toHaveLength(0);
    expect(await t.repos.evaluations.findByInterview(id)).toBeNull();
    expect(await t.repos.events.listByInterview(id)).toHaveLength(0);
    expect(await t.repos.submissions.listByInterview(id)).toHaveLength(0);
    expect(await t.repos.runs.listByInterview(id)).toHaveLength(0);
    // Shared catalog rows survive the cascade.
    expect(await t.repos.problems.findById(p.id)).not.toBeNull();
    // Second delete reports missing.
    expect(await t.repos.interviews.deleteById(id)).toBe(false);
  }));
});
