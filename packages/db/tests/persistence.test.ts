// S2 persistence tests (HLD Phase 2 exit):
// process restart must not destroy authoritative interview state.
// Requires Postgres (`docker compose up db`, migrations applied).
// Warn-and-pass without a DB so plain `pnpm test` stays green.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InterviewService,
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
});
