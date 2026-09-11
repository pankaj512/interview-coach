import { describe, expect, it } from "vitest";
import { asProblemId, asUserId } from "../src/ids.js";
import type { InterviewId } from "../src/ids.js";
import { createProblem } from "../src/problem.js";
import { createInMemoryRepositories } from "../src/repositories.js";
import { InterviewService } from "../src/interview-service.js";
import { SubmissionService } from "../src/submission-service.js";
import { ToolService } from "../src/tool-service.js";
import { must, mustErr } from "./helpers.js";

export const throwingExecutor = {
  execute: async (): Promise<never> => {
    throw new Error("no executor in unit test");
  },
};

function setup() {
  const repos = createInMemoryRepositories();
  const now = new Date("2026-09-11T10:00:00.000Z");
  const clock = { now: () => now };
  const interviews = new InterviewService({ ...repos, clock });
  const submissions = new SubmissionService({
    interviews,
    submissions: repos.submissions,
    runs: repos.runs,
    events: repos.events,
    executor: throwingExecutor,
    clock,
  });
  const tools = new ToolService({
    interviews,
    responses: repos.responses,
    evaluations: repos.evaluations,
    events: repos.events,
    submissions,
    clock,
  });
  return { repos, interviews, tools };
}

async function readyInterview(
  interviews: InterviewService,
  repos: ReturnType<typeof createInMemoryRepositories>,
  opts: { withProblem: boolean },
): Promise<InterviewId> {
  await repos.problems.save(
    must(
      createProblem({
        id: asProblemId("prob_move-zeroes"),
        title: "Move Zeroes",
        difficulty: "Easy",
      }),
    ),
  );
  const created = must(
    await interviews.createInterview({
      candidateId: asUserId("user_candidate"),
      configuration: { interviewType: "dsa" },
    }),
  );
  must(await interviews.markReady(created.id));
  if (opts.withProblem) {
    must(
      await interviews.assignProblems(created.id, [
        asProblemId("prob_move-zeroes"),
      ]),
    );
    must(await interviews.start(created.id));
    must(
      await interviews.recordResponse(created.id, {
        kind: "approach",
        content: "Two pointers.",
      }),
    );
    must(
      await interviews.recordResponse(created.id, {
        kind: "code",
        content: "def moveZeroes(nums): ...",
      }),
    );
  }
  return created.id;
}

describe("ToolService", () => {
  it("get_current_problem returns the active problem", async () => {
    const { repos, interviews, tools } = setup();
    const id = await readyInterview(interviews, repos, { withProblem: true });
    const result = must(
      await tools.dispatch("get_current_problem", {
        interviewId: id,
        callId: "call_1",
      }),
    );
    expect(result).toMatchObject({ problem: { title: "Move Zeroes" } });
    const events = await repos.events.listByInterview(id);
    expect(events.some((e) => e.type === "tool.invoked")).toBe(true);
  });

  it("get_current_problem errors deterministically without a problem", async () => {
    const { repos, interviews, tools } = setup();
    const id = await readyInterview(interviews, repos, { withProblem: false });
    const result = await tools.getCurrentProblem({
      interviewId: id,
      callId: "call_2",
    });
    expect(mustErr(result)).toBe("NO_CURRENT_PROBLEM");
  });

  it("get_interview_state reflects status and counts", async () => {
    const { repos, interviews, tools } = setup();
    const id = await readyInterview(interviews, repos, { withProblem: true });
    const state = must(
      await tools.getInterviewState({ interviewId: id, callId: "call_3" }),
    );
    expect(state.status).toBe("in_progress");
    expect(state.currentProblemId).toBe("prob_move-zeroes");
    expect(state.problemCount).toBe(1);
    expect(state.responseCount).toBe(2);
  });

  it("get_candidate_performance breaks down responses by kind", async () => {
    const { repos, interviews, tools } = setup();
    const id = await readyInterview(interviews, repos, { withProblem: true });
    const perf = must(
      await tools.getCandidatePerformance({ interviewId: id, callId: "call_4" }),
    );
    expect(perf.responseCount).toBe(2);
    expect(perf.byKind).toMatchObject({ approach: 1, code: 1, answer: 0 });
    expect(perf.hasEvaluation).toBe(false);
    expect(perf.hintsUsed).toBe(0);
  });

  it("end_interview moves to completing and is idempotent", async () => {
    const { repos, interviews, tools } = setup();
    const id = await readyInterview(interviews, repos, { withProblem: true });
    const first = must(
      await tools.dispatch("end_interview", {
        interviewId: id,
        callId: "call_5",
      }),
    );
    expect(first).toMatchObject({ status: "completing", transitioned: true });
    const second = must(
      await tools.endInterview({ interviewId: id, callId: "call_5" }),
    );
    expect(second).toMatchObject({ status: "completing", transitioned: false });
  });

  it("end_interview rejects interviews that never started", async () => {
    const { repos, interviews, tools } = setup();
    const id = await readyInterview(interviews, repos, { withProblem: false });
    expect(
      mustErr(await tools.endInterview({ interviewId: id, callId: "call_6" })),
    ).toBe("ILLEGAL_TRANSITION");
    const events = await repos.events.listByInterview(id);
    expect(events.some((e) => e.type === "tool.failed")).toBe(false);
  });

  it("dispatch records tool.failed on error", async () => {
    const { repos, interviews, tools } = setup();
    const id = await readyInterview(interviews, repos, { withProblem: false });
    const result = await tools.dispatch("get_current_problem", {
      interviewId: id,
      callId: "call_7",
    });
    expect(mustErr(result)).toBe("NO_CURRENT_PROBLEM");
    const events = await repos.events.listByInterview(id);
    expect(events.some((e) => e.type === "tool.failed")).toBe(true);
  });
});
