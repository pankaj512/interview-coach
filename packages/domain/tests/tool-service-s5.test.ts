import { describe, expect, it } from "vitest";
import { asProblemId, asUserId } from "../src/ids.js";
import type { InterviewId } from "../src/ids.js";
import { createProblem } from "../src/problem.js";
import { createInMemoryRepositories } from "../src/repositories.js";
import { InterviewService } from "../src/interview-service.js";
import { SubmissionService } from "../src/submission-service.js";
import { ToolService } from "../src/tool-service.js";
import { must, mustErr } from "./helpers.js";
import { throwingExecutor } from "./tool-service.test.js";

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

describe("ToolService S5 tools", () => {
  it("get_interview_configuration returns backend-owned config", async () => {
    const { repos, interviews, tools } = setup();
    const id = await runningInterview(interviews, repos);
    const result = must(
      await tools.dispatch("get_interview_configuration", { interviewId: id, callId: "c1" }),
    );
    expect(result).toMatchObject({
      status: "in_progress",
      currentProblemId: "prob_two-sum",
      problemCount: 1,
    });
    expect((result as { configuration: { difficulty: string } }).configuration).toMatchObject({
      interviewType: "dsa",
      difficulty: "Easy",
    });
  });

  it("get_problem_hint escalates tiers and counts hints", async () => {
    const { repos, interviews, tools } = setup();
    const id = await runningInterview(interviews, repos);
    const first = must(
      await tools.dispatch("get_problem_hint", { interviewId: id, callId: "h1" }),
    );
    expect(first).toMatchObject({ level: 1, revealsSolution: false, hintsUsed: 1 });
    const second = must(
      await tools.dispatch("get_problem_hint", { interviewId: id, callId: "h2" }),
    );
    expect(second).toMatchObject({ level: 2, hintsUsed: 2 });
    const explicit = must(
      await tools.dispatch(
        "get_problem_hint",
        { interviewId: id, callId: "h3" },
        { level: 3 },
      ),
    );
    expect(explicit).toMatchObject({ level: 3, hintsUsed: 3 });
    const capped = must(
      await tools.dispatch("get_problem_hint", { interviewId: id, callId: "h4" }),
    );
    expect(capped).toMatchObject({ level: 3, hintsUsed: 4 });
  });

  it("get_problem_hint rejects bad levels and missing problems", async () => {
    const { repos, interviews, tools } = setup();
    const id = await runningInterview(interviews, repos);
    expect(
      mustErr(
        await tools.dispatch("get_problem_hint", { interviewId: id, callId: "h5" }, { level: 9 }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("record_candidate_answer persists a response", async () => {
    const { repos, interviews, tools } = setup();
    const id = await runningInterview(interviews, repos);
    const result = must(
      await tools.dispatch(
        "record_candidate_answer",
        { interviewId: id, callId: "a1" },
        { kind: "approach", content: "Use a hash map." },
      ),
    );
    expect(result).toMatchObject({ recorded: true, kind: "approach", responseCount: 1 });
    const responses = await repos.responses.listByInterview(id);
    expect(responses[0]?.content).toBe("Use a hash map.");
  });

  it("record_candidate_answer validates content and kind", async () => {
    const { repos, interviews, tools } = setup();
    const id = await runningInterview(interviews, repos);
    expect(
      mustErr(
        await tools.dispatch(
          "record_candidate_answer",
          { interviewId: id, callId: "a2" },
          { kind: "approach", content: "   " },
        ),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        await tools.dispatch(
          "record_candidate_answer",
          { interviewId: id, callId: "a3" },
          { kind: "nope", content: "x" },
        ),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("recordEvaluation works after completion (post-interview pipeline)", async () => {
    const { repos, interviews } = setup();
    const id = await runningInterview(interviews, repos);
    must(await interviews.beginCompleting(id));
    must(await interviews.complete(id));
    const recorded = must(
      await interviews.recordEvaluation(id, {
        dimensions: { correctness: { score: 4 } },
        strengths: ["steady"],
      }),
    );
    expect(recorded.dimensions["correctness"]).toMatchObject({ score: 4 });
  });
});
