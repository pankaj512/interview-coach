import { describe, expect, it } from "vitest";
import { asProblemId, asUserId } from "../src/ids.js";
import type { InterviewId } from "../src/ids.js";
import { createProblem } from "../src/problem.js";
import type { CodeExecutor, ExecutorOutcome } from "../src/submission.js";
import { createInMemoryRepositories } from "../src/repositories.js";
import { InterviewService } from "../src/interview-service.js";
import { SubmissionService } from "../src/submission-service.js";
import { ToolService } from "../src/tool-service.js";
import { must, mustErr } from "./helpers.js";
import { throwingExecutor } from "./tool-service.test.js";

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
    executor: executor ?? throwingExecutor,
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

async function runningInterview(
  interviews: InterviewService,
  repos: ReturnType<typeof createInMemoryRepositories>,
): Promise<InterviewId> {
  await repos.problems.save(
    must(
      createProblem({
        id: asProblemId("prob_two-sum"),
        title: "Two Sum",
        difficulty: "Easy",
        expectedConcepts: ["Arrays"],
      }),
    ),
  );
  const created = must(
    await interviews.createInterview({
      candidateId: asUserId("user_candidate"),
      configuration: { interviewType: "dsa", difficulty: "Easy" },
    }),
  );
  must(await interviews.markReady(created.id));
  must(await interviews.assignProblems(created.id, [asProblemId("prob_two-sum")]));
  must(await interviews.start(created.id));
  return created.id;
}

function fakeExecutor(): CodeExecutor {
  return {
    execute: async (_submission, testCases): Promise<ExecutorOutcome> => ({
      status: "completed",
      results: testCases.map((t) => ({
        name: t.name,
        passed: true,
        actual: t.expected,
      })),
      durationMs: 4,
    }),
  };
}

describe("ToolService S7a sandbox tools", () => {
  it("submit_solution persists code and run_code executes the latest", async () => {
    const { repos, interviews, tools } = setup(fakeExecutor());
    const id = await runningInterview(interviews, repos);
    const submitted = must(
      await tools.dispatch(
        "submit_solution",
        { interviewId: id, callId: "s1" },
        { language: "javascript", code: "function solve(a){return a;}" },
      ),
    );
    expect(submitted).toMatchObject({
      language: "javascript",
      submissionCount: 1,
    });
    const submissionId = (submitted as { submissionId: string }).submissionId;
    expect(submissionId.startsWith("sub_")).toBe(true);

    const run = must(
      await tools.dispatch(
        "run_code",
        { interviewId: id, callId: "s2" },
        { testCases: [{ name: "t1", args: [1], expected: 1 }] },
      ),
    );
    expect(run).toMatchObject({
      submissionId,
      status: "passed",
      passedCount: 1,
      totalCount: 1,
    });

    const perf = must(
      await tools.dispatch("get_candidate_performance", {
        interviewId: id,
        callId: "s3",
      }),
    );
    expect(perf).toMatchObject({ submissionCount: 1, lastRunStatus: "passed" });
  });

  it("submit_solution validates language and code", async () => {
    const { repos, interviews, tools } = setup();
    const id = await runningInterview(interviews, repos);
    expect(
      mustErr(
        await tools.dispatch(
          "submit_solution",
          { interviewId: id, callId: "s1" },
          { language: "go", code: "x" },
        ),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        await tools.dispatch(
          "submit_solution",
          { interviewId: id, callId: "s2" },
          { language: "python", code: "  " },
        ),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("run_code reports no-submissions and bad cases", async () => {
    const { repos, interviews, tools } = setup(fakeExecutor());
    const id = await runningInterview(interviews, repos);
    expect(
      mustErr(
        await tools.dispatch(
          "run_code",
          { interviewId: id, callId: "s1" },
          { testCases: [{ name: "t1", args: [], expected: 0 }] },
        ),
      ),
    ).toBe("NOT_FOUND");
    // Unknown submission ids surface before case validation.
    expect(
      mustErr(
        await tools.dispatch(
          "run_code",
          { interviewId: id, callId: "s2" },
          { submissionId: "sub_missing", testCases: [] },
        ),
      ),
    ).toBe("NOT_FOUND");
    // Empty case lists are rejected against a real submission.
    const submitted = must(
      await tools.dispatch(
        "submit_solution",
        { interviewId: id, callId: "s3" },
        { language: "python", code: "x = 1" },
      ),
    );
    const submissionId = (submitted as { submissionId: string }).submissionId;
    expect(
      mustErr(
        await tools.dispatch(
          "run_code",
          { interviewId: id, callId: "s4" },
          { submissionId, testCases: [] },
        ),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});
