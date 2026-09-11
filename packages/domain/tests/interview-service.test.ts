import { describe, expect, it } from "vitest";
import { asProblemId, asUserId } from "../src/ids.js";
import type { InterviewId } from "../src/ids.js";
import { createProblem } from "../src/problem.js";
import { createInMemoryRepositories } from "../src/repositories.js";
import { InterviewService } from "../src/interview-service.js";
import { must, mustErr } from "./helpers.js";

function setup() {
  const repos = createInMemoryRepositories();
  let now = new Date("2026-09-11T10:00:00.000Z");
  const clock = { now: () => now };
  const service = new InterviewService({ ...repos, clock });
  return {
    repos,
    service,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

async function seedProblems(
  service: InterviewService,
  repos: ReturnType<typeof createInMemoryRepositories>,
) {
  const a = must(
    createProblem({
      id: asProblemId("prob_move-zeroes"),
      title: "Move Zeroes",
      difficulty: "Easy",
    }),
  );
  const b = must(
    createProblem({
      id: asProblemId("prob_two-sum"),
      title: "Two Sum",
      difficulty: "Easy",
    }),
  );
  await repos.problems.save(a);
  await repos.problems.save(b);
  return { a, b };
}

async function runningInterview(service: InterviewService): Promise<InterviewId> {
  const created = must(
    await service.createInterview({
      candidateId: asUserId("user_candidate"),
      configuration: { interviewType: "dsa", problemCount: 2 },
    }),
  );
  must(await service.markReady(created.id));
  must(
    await service.assignProblems(created.id, [
      asProblemId("prob_move-zeroes"),
      asProblemId("prob_two-sum"),
    ]),
  );
  must(await service.start(created.id));
  return created.id;
}

describe("InterviewService", () => {
  it("runs the full interview loop with events", async () => {
    const { repos, service, advance } = setup();
    await seedProblems(service, repos);
    const id = await runningInterview(service);

    advance(60_000);
    must(
      await service.recordResponse(id, {
        kind: "approach",
        content: "I will use two pointers.",
      }),
    );
    must(await service.pause(id));
    must(await service.resume(id));
    must(await service.setCurrentProblem(id, asProblemId("prob_two-sum")));
    must(await service.beginCompleting(id));
    const evaluation = must(
      await service.recordEvaluation(id, {
        hintsUsed: 1,
        strengths: ["clear communication"],
        weaknesses: ["missed edge case"],
        recommendation: "lean_hire",
      }),
    );
    expect(evaluation.hintsUsed).toBe(1);
    const completed = must(await service.complete(id));
    expect(completed.status).toBe("completed");
    expect(completed.endedAt).toBeDefined();

    const snapshot = must(await service.getState(id));
    expect(snapshot.currentProblem?.title).toBe("Two Sum");
    expect(snapshot.responseCount).toBe(1);
    expect(snapshot.evaluation?.recommendation).toBe("lean_hire");

    const events = await repos.events.listByInterview(id);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("interview.created");
    expect(types).toContain("problem.assigned");
    expect(types).toContain("response.recorded");
    expect(types).toContain("evaluation.recorded");
    expect(types[types.length - 1]).toBe("interview.completed");
  });

  it("rejects assigning unknown problems", async () => {
    const { service } = setup();
    const created = must(
      await service.createInterview({
        candidateId: asUserId("user_candidate"),
        configuration: { interviewType: "dsa" },
      }),
    );
    const result = await service.assignProblems(created.id, [
      asProblemId("prob_missing"),
    ]);
    expect(mustErr(result)).toBe("NOT_FOUND");
  });

  it("rejects assignment once running and double start", async () => {
    const { repos, service } = setup();
    await seedProblems(service, repos);
    const id = await runningInterview(service);
    expect(
      mustErr(
        await service.assignProblems(id, [asProblemId("prob_move-zeroes")]),
      ),
    ).toBe("ILLEGAL_TRANSITION");
    expect(mustErr(await service.start(id))).toBe("ILLEGAL_TRANSITION");
  });

  it("rejects responses before start and empty content", async () => {
    const { repos, service } = setup();
    await seedProblems(service, repos);
    const created = must(
      await service.createInterview({
        candidateId: asUserId("user_candidate"),
        configuration: { interviewType: "dsa" },
      }),
    );
    expect(
      mustErr(
        await service.recordResponse(created.id, {
          kind: "answer",
          content: "hello",
        }),
      ),
    ).toBe("ILLEGAL_TRANSITION");

    const id = await runningInterview(service);
    expect(
      mustErr(
        await service.recordResponse(id, { kind: "answer", content: "   " }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("returns NOT_FOUND for unknown interviews", async () => {
    const { service } = setup();
    const missing = "iv_missing" as InterviewId;
    expect(mustErr(await service.getState(missing))).toBe("NOT_FOUND");
    expect(mustErr(await service.start(missing))).toBe("NOT_FOUND");
  });

  it("rejects invalid configuration", async () => {
    const { service } = setup();
    expect(
      mustErr(
        await service.createInterview({
          candidateId: asUserId("user_candidate"),
          configuration: { interviewType: "dsa", durationMinutes: 0 },
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("deletes finished interviews and reports the pre-delete status", async () => {
    const { repos, service } = setup();
    const created = must(
      await service.createInterview({
        candidateId: asUserId("user_candidate"),
        configuration: { interviewType: "dsa" },
      }),
    );
    must(await service.markReady(created.id));
    must(await service.start(created.id));
    must(await service.cancel(created.id, "no show"));
    const deleted = must(await service.deleteInterview(created.id));
    expect(deleted).toMatchObject({ id: created.id, status: "cancelled" });
    expect(await repos.interviews.findById(created.id)).toBeNull();
    expect(mustErr(await service.deleteInterview(created.id))).toBe("NOT_FOUND");
  });

  it("refuses to delete live interviews", async () => {
    const { repos, service } = setup();
    await seedProblems(service, repos);
    const id = await runningInterview(service);
    expect(mustErr(await service.deleteInterview(id))).toBe("ILLEGAL_TRANSITION");
    must(await service.pause(id));
    expect(mustErr(await service.deleteInterview(id))).toBe("ILLEGAL_TRANSITION");
  });
});
