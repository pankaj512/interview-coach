import { describe, expect, it } from "vitest";
import { asInterviewId, asProblemId, asUserId } from "../src/ids.js";
import type { InterviewId } from "../src/ids.js";
import { createEvaluation } from "../src/evaluation.js";
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

// ---- P1 audit fixes ----
describe("InterviewService - P1 audit fixes", () => {
  it("F2: completeCurrentProblem marks done and advances; last clears currentOrder", async () => {
    const { repos, service } = setup();
    await seedProblems(service, repos);
    const id = await runningInterview(service);

    const afterFirst = must(await service.completeCurrentProblem(id));
    expect(afterFirst.currentOrder).toBe(1);
    expect(afterFirst.problems.find((p) => p.order === 0)?.state).toBe("completed");
    expect(afterFirst.problems.find((p) => p.order === 1)?.state).toBe("active");

    const afterSecond = must(await service.completeCurrentProblem(id));
    expect(afterSecond.currentOrder).toBeNull();
    expect(afterSecond.problems.every((p) => p.state === "completed")).toBe(true);

    expect(mustErr(await service.completeCurrentProblem(id))).toBe("NO_CURRENT_PROBLEM");
  });

  it("F2: skipProblem advances to the next assigned problem", async () => {
    const { repos, service } = setup();
    await seedProblems(service, repos);
    const id = await runningInterview(service);
    const skipped = must(await service.skipProblem(id));
    expect(skipped.problems.find((p) => p.order === 0)?.state).toBe("skipped");
    expect(skipped.currentOrder).toBe(1);
  });

  it("F3: rejects an empty problem assignment", async () => {
    const { service } = setup();
    const created = must(
      await service.createInterview({
        candidateId: asUserId("user_candidate"),
        configuration: { interviewType: "dsa" },
      }),
    );
    expect(mustErr(await service.assignProblems(created.id, []))).toBe("VALIDATION_ERROR");
  });

  it("F4: rejects unknown difficulty, empty topicFocus, and long topics", async () => {
    const { service } = setup();
    expect(
      mustErr(
        await service.createInterview({
          candidateId: asUserId("user_candidate"),
          configuration: { interviewType: "dsa", difficulty: "Nonsense" as unknown as "Easy" },
        }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        await service.createInterview({
          candidateId: asUserId("user_candidate"),
          configuration: { interviewType: "dsa", topicFocus: [""] },
        }),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      mustErr(
        await service.createInterview({
          candidateId: asUserId("user_candidate"),
          configuration: { interviewType: "dsa", topicFocus: ["x".repeat(121)] },
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("F5: rejects response content over the shared cap", async () => {
    const { repos, service } = setup();
    await seedProblems(service, repos);
    const id = await runningInterview(service);
    expect(
      mustErr(await service.recordResponse(id, { kind: "answer", content: "x".repeat(10_001) })),
    ).toBe("VALIDATION_ERROR");
  });

  it("F10: recordResponse returns both the interview and the created response", async () => {
    const { repos, service } = setup();
    await seedProblems(service, repos);
    const id = await runningInterview(service);
    const recorded = must(await service.recordResponse(id, { kind: "answer", content: "hash map" }));
    expect(recorded.interview.id).toBe(id);
    expect(recorded.response.content).toBe("hash map");
  });

  it("F7: in-memory evaluation lookup returns the latest row", async () => {
    const { repos } = setup();
    const base = { interviewId: asInterviewId("iv_latest"), hintsUsed: 0 };
    const older = must(
      createEvaluation({ ...base, now: new Date("2026-09-11T10:00:00.000Z"), strengths: ["old"] }),
    );
    const newer = must(
      createEvaluation({ ...base, now: new Date("2026-09-11T11:00:00.000Z"), strengths: ["new"] }),
    );
    await repos.evaluations.save(older);
    await repos.evaluations.save(newer);
    const found = await repos.evaluations.findByInterview(asInterviewId("iv_latest"));
    expect(found?.strengths).toEqual(["new"]);
  });

  it("P2-2: rejects duplicate problem ids instead of hitting the unique index", async () => {
    const { service } = setup();
    const created = must(
      await service.createInterview({
        candidateId: asUserId("user_candidate"),
        configuration: { interviewType: "dsa" },
      }),
    );
    expect(
      mustErr(
        await service.assignProblems(created.id, [
          asProblemId("prob_two-sum"),
          asProblemId("prob_two-sum"),
        ]),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("F6: rejects unknown evaluation dimension keys", async () => {
    const { repos, service } = setup();
    await seedProblems(service, repos);
    const id = await runningInterview(service);
    expect(
      mustErr(
        await service.recordEvaluation(id, {
          dimensions: { nonsense: { score: 3 } } as never,
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});
