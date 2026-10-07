import { describe, expect, it } from "vitest";
import { asUserId } from "../src/ids.js";
import type { InterviewId } from "../src/ids.js";
import type { CodeExecutor, ExecutorOutcome } from "../src/submission.js";
import { createInMemoryRepositories } from "../src/repositories.js";
import { InterviewService } from "../src/interview-service.js";
import { SubmissionService } from "../src/submission-service.js";
import { must, mustErr } from "./helpers.js";

function passingExecutor(): CodeExecutor {
  return {
    execute: async (_submission, testCases): Promise<ExecutorOutcome> => ({
      status: "completed",
      results: testCases.map((t) => ({
        name: t.name,
        passed: true,
        actual: t.expected,
      })),
      durationMs: 5,
    }),
  };
}

function setup(executor?: CodeExecutor) {
  const repos = createInMemoryRepositories();
  const now = new Date("2026-09-11T10:00:00.000Z");
  const clock = { now: () => now };
  const interviews = new InterviewService({ ...repos, clock });
  const submissions = new SubmissionService({
    interviews,
    submissions: repos.submissions,
    runs: repos.runs,
    events: repos.events,
    executor: executor ?? passingExecutor(),
    clock,
  });
  return { repos, interviews, submissions };
}

async function runningInterview(
  interviews: InterviewService,
): Promise<InterviewId> {
  const created = must(
    await interviews.createInterview({
      candidateId: asUserId("user_candidate"),
      configuration: { interviewType: "dsa" },
    }),
  );
  must(await interviews.markReady(created.id));
  must(await interviews.start(created.id));
  return created.id;
}

const CASES = [{ name: "basic", args: [1], expected: 1 }];

describe("SubmissionService", () => {
  it("submits code and runs it against cases", async () => {
    const { interviews, submissions } = setup();
    const id = await runningInterview(interviews);
    const sub = must(
      await submissions.submit(id, {
        language: "python",
        code: "def solve(x):\n    return x",
      }),
    );
    expect(sub.id.startsWith("sub_")).toBe(true);
    const run = must(await submissions.runTests(sub.id, CASES));
    expect(run).toMatchObject({
      status: "passed",
      passedCount: 1,
      totalCount: 1,
    });
    const summary = must(await submissions.latestSummary(id));
    expect(summary).toMatchObject({ status: "passed", passRate: 100 });
    expect(await submissions.submissionCount(id)).toBe(1);
  });

  it("rejects submit/run outside a live interview", async () => {
    const { interviews, submissions } = setup();
    const created = must(
      await interviews.createInterview({
        candidateId: asUserId("user_candidate"),
        configuration: { interviewType: "dsa" },
      }),
    );
    expect(
      mustErr(
        await submissions.submit(created.id, { language: "python", code: "x=1" }),
      ),
    ).toBe("ILLEGAL_TRANSITION");
    must(await interviews.markReady(created.id));
    const sub = must(
      await submissions.submit(created.id, { language: "python", code: "x=1" }),
    );
    // Ready allows submit *and* run; cancellation revokes both.
    must(await interviews.cancel(created.id, "withdrawn"));
    expect(
      mustErr(await submissions.runTests(sub.id, CASES)),
    ).toBe("ILLEGAL_TRANSITION");
    expect(
      mustErr(
        await submissions.submit(created.id, { language: "python", code: "x=1" }),
      ),
    ).toBe("ILLEGAL_TRANSITION");
  });

  it("rejects unknown submissions and bad cases", async () => {
    const { interviews, submissions } = setup();
    const id = await runningInterview(interviews);
    expect(
      mustErr(
        await submissions.runTests(
          "sub_missing" as never,
          CASES,
        ),
      ),
    ).toBe("NOT_FOUND");
    const sub = must(
      await submissions.submit(id, { language: "python", code: "x=1" }),
    );
    expect(mustErr(await submissions.runTests(sub.id, []))).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("persists runner crashes as error runs", async () => {
    const { interviews, submissions } = setup({
      execute: async () => {
        throw new Error("boom");
      },
    });
    const id = await runningInterview(interviews);
    const sub = must(
      await submissions.submit(id, { language: "python", code: "x=1" }),
    );
    const run = must(await submissions.runTests(sub.id, CASES));
    expect(run.status).toBe("error");
  });

  it("latestSubmission returns null before any submit", async () => {
    const { interviews, submissions } = setup();
    const id = await runningInterview(interviews);
    expect(must(await submissions.latestSubmission(id))).toBeNull();
    expect(must(await submissions.latestSummary(id))).toBeNull();
  });
});
