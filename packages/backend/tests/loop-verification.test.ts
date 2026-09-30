// Feature 19: loop verification. One repeatable end-to-end pass over HTTP:
// register -> profile -> recommend -> accept -> interview (assign/ready/start)
// -> submit code -> run tests -> submit-verdict -> end -> evaluation ->
// history + progress reads. Deterministic fakes for the models and the code
// executor; persistence is genuinely exercised when TEST_DATABASE_URL points
// at a live *_test database, otherwise the same loop runs on in-memory repos.

import { afterEach, describe, expect, it } from "vitest";
import {
  DSA_CURRICULUM_ID,
  asProblemId,
  createInMemoryRepositories,
  type CodeExecutor,
  type EvaluationModel,
  type EvaluationModelInput,
  type EvaluationModelResult,
  type RecommendationModel,
  type RecommendationModelInput,
  type RecommendationModelResult,
  type RepositorySet,
  type SubmitVerdictInput,
  type SubmitVerdictModel,
} from "@interview-coach/domain";
import { createDatabase, createDrizzleRepositories, type Database } from "@interview-coach/db";
import { buildApp, type BuiltBackend } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { FakeVoiceSessionProvider } from "../src/voice-session.js";
import { seedCurriculum, seedDataAvailable } from "./helpers.js";

let app: BuiltBackend | null = null;
let dbHandle: Database | null = null;
afterEach(async () => {
  if (app !== null) await app.app.close();
  app = null;
  if (dbHandle !== null) await dbHandle.close();
  dbHandle = null;
});

const uid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const PROBLEM_ID = `prob_loop_verify_${uid}`;

async function resolveRepos(): Promise<{ repos: RepositorySet; mode: "postgres" | "memory" }> {
  const url = process.env["TEST_DATABASE_URL"] ?? "";
  const name = (() => {
    try {
      return new URL(url).pathname.replace(/^\//, "");
    } catch {
      return "";
    }
  })();
  const allowed = process.env["ALLOW_DESTRUCTIVE_DB_TESTS"] === "true" || /test/i.test(name);
  if (url !== "" && allowed) {
    try {
      const handle = createDatabase(url);
      const repos = createDrizzleRepositories(handle.db);
      // Liveness probe through the repo interface: an empty test DB answers
      // null, an unreachable one throws. No drizzle-orm import needed here.
      await repos.curricula.findById(DSA_CURRICULUM_ID);
      dbHandle = handle;
      return { repos, mode: "postgres" };
    } catch {
      if (dbHandle !== null) await dbHandle.close();
      dbHandle = null;
      // Fall through to in-memory; the loop still runs, persistence is not proven.
    }
  }
  return { repos: createInMemoryRepositories(), mode: "memory" };
}

class LoopRecommendationModel implements RecommendationModel {
  readonly name = "loop-recommendation";
  async recommend(input: RecommendationModelInput): Promise<RecommendationModelResult> {
    const candidate = input.candidateSet.candidates[0];
    if (candidate === undefined) return { proposal: null };
    return {
      proposal: {
        recommendationType: candidate.recommendationType,
        topicId: candidate.topicId,
        problemId: candidate.problemId,
        reason: "Loop verification picks the top candidate.",
      },
    };
  }
}

class LoopEvaluationModel implements EvaluationModel {
  readonly name = "loop-evaluation";
  async evaluate(_input: EvaluationModelInput): Promise<EvaluationModelResult> {
    return {
      proposal: {
        dimensions: {
          problem_understanding: { score: 4 },
          approach: { score: 4 },
          communication: { score: 4 },
          coding: { score: 4, notes: "Passing sample." },
          testing_debugging: { score: 4 },
          complexity_analysis: { score: 4 },
          independence: { score: 4 },
        },
        strengths: ["Steady progress"],
        weaknesses: ["Edge cases"],
      },
    };
  }
}

const LOOP_VERDICT = {
  correctness: "correct" as const,
  correctnessNotes: "Matches the sample.",
  optimality: "O(n) time, O(1) space",
  optimalityNotes: "Single pass.",
  breakPoints: [],
  edgeCases: ["Empty input"],
  summary: "Correct and optimal.",
};

const loopVerdictModel: SubmitVerdictModel = {
  name: "loop-verdict",
  judge: async (_input: SubmitVerdictInput) => ({ proposal: LOOP_VERDICT }),
};

const loopExecutor: CodeExecutor = {
  execute: async (_submission, testCases) => ({
    status: "completed",
    results: testCases.map((t) => ({ name: t.name, passed: true, actual: t.expected })),
    durationMs: 7,
  }),
};

async function seedLoopProblem(repos: RepositorySet): Promise<void> {
  await repos.problems.save({
    id: asProblemId(PROBLEM_ID),
    title: "Loop Verify",
    difficulty: "Easy",
    examples: [{ input: "[1, 0]", output: "[1]" }],
    runnerLinks: {
      python: { runnerId: "shape-001", entry: "solve", className: "Solution", actualRule: "pure" },
    },
  });
}

describe("feature 19 loop verification", () => {
  it.skipIf(!seedDataAvailable())("walks dashboard -> lobby -> live -> evaluating -> results -> history/progress", async () => {
    const { repos, mode } = await resolveRepos();
    console.info(`loop verification running against ${mode} repos`);
    const built = buildApp({
      repos,
      config: loadConfig({ ...process.env, HOST: "127.0.0.1", PORT: "3000", CORS_ORIGIN: "http://localhost:5173" }),
      voiceProvider: new FakeVoiceSessionProvider(),
      recommendationModel: new LoopRecommendationModel(),
      evaluationModel: new LoopEvaluationModel(),
      submitVerdictModel: loopVerdictModel,
      codeRunner: loopExecutor,
      evaluationRunSynchronously: true,
      logger: false,
    });
    app = built;

    await seedCurriculum(repos);
    await seedLoopProblem(repos);

    // Dashboard: register + profile + current recommendation (empty before generate).
    const registered = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: `loop-verify-${uid}@example.com`, displayName: "Loop", password: "correct-horse-123" },
    });
    expect(registered.statusCode).toBe(201);
    const auth = {
      authorization: `Bearer ${(registered.json() as { session: { token: string } }).session.token}`,
    };
    const profile = await built.app.inject({ method: "GET", url: "/api/profile", headers: auth });
    expect(profile.statusCode).toBe(200);

    // Lobby: generate + accept the recommendation.
    const generated = await built.app.inject({ method: "POST", url: "/api/recommendations", headers: auth });
    expect(generated.statusCode).toBe(201);
    const initial = (generated.json() as { recommendation: { id: string } }).recommendation;
    const accepted = await built.app.inject({
      method: "POST",
      url: `/api/recommendations/${initial.id}/accept`,
      headers: auth,
    });
    expect(accepted.statusCode).toBe(200);

    // Live: create -> assign -> ready -> start.
    const created = await built.app.inject({
      method: "POST",
      url: "/api/interviews",
      headers: auth,
      payload: {
        candidateId: "ignored",
        configuration: { interviewType: "dsa" },
        recommendationId: initial.id,
      },
    });
    expect(created.statusCode).toBe(201);
    const interviewId = (created.json() as { interview: { id: string } }).interview.id;
    const assigned = await built.app.inject({
      method: "POST",
      url: `/api/interviews/${interviewId}/problems`,
      headers: auth,
      payload: { problemIds: [PROBLEM_ID] },
    });
    expect(assigned.statusCode).toBe(200);
    expect((await built.app.inject({ method: "POST", url: `/api/interviews/${interviewId}/ready`, headers: auth })).statusCode).toBe(200);
    expect((await built.app.inject({ method: "POST", url: `/api/interviews/${interviewId}/start`, headers: auth })).statusCode).toBe(200);

    // Live room: Test (submit code + run) and Submit for Review (verdict).
    const submitted = await built.app.inject({
      method: "POST",
      url: `/api/interviews/${interviewId}/submissions`,
      headers: auth,
      payload: { language: "python", code: "def solve(xs):\n    return [x for x in xs if x != 0]\n", problemId: PROBLEM_ID },
    });
    expect(submitted.statusCode).toBe(201);
    const submissionId = (submitted.json() as { submission: { id: string } }).submission.id;
    const ran = await built.app.inject({
      method: "POST",
      url: `/api/interviews/${interviewId}/submissions/${submissionId}/runs`,
      headers: auth,
      payload: { testCases: [{ name: "sample 1", args: ["[1, 0]"], expected: "[1]" }] },
    });
    expect(ran.statusCode).toBe(201);
    expect(ran.json()).toMatchObject({ ok: true, run: { status: "passed", passedCount: 1 } });
    const verdict = await built.app.inject({
      method: "POST",
      url: `/api/interviews/${interviewId}/submit-verdict`,
      headers: auth,
      payload: { language: "python", code: "def solve(xs):\n    return [x for x in xs if x != 0]\n", problemId: PROBLEM_ID },
    });
    expect(verdict.statusCode).toBe(200);
    expect(verdict.json()).toMatchObject({ ok: true, verdict: LOOP_VERDICT });

    // Evaluating -> results: end, then the evaluation read the client polls.
    const ended = await built.app.inject({ method: "POST", url: `/api/interviews/${interviewId}/end`, headers: auth });
    expect(ended.statusCode).toBe(200);
    const evaluation = await built.app.inject({
      method: "GET",
      url: `/api/interviews/${interviewId}/evaluation`,
      headers: auth,
    });
    expect(evaluation.statusCode).toBe(200);
    const evaluationBody = (evaluation.json() as { evaluation: Record<string, unknown> }).evaluation;
    expect(evaluationBody).toMatchObject({ status: "completed", source: "llm" });
    expect(typeof evaluationBody["overallScore"]).toBe("number");
    expect(Object.keys(evaluationBody["dimensions"] as object)).toContain("testing_debugging");

    // History + progress reads.
    const history = await built.app.inject({ method: "GET", url: "/api/interviews", headers: auth });
    expect(history.statusCode).toBe(200);
    const items = (history.json() as { interviews: { interview: { id: string } }[] }).interviews;
    expect(items.map((i) => i.interview.id)).toContain(interviewId);
    const skills = await built.app.inject({ method: "GET", url: "/api/skills", headers: auth });
    expect(skills.statusCode).toBe(200);

    // The loop regenerates: a new active recommendation supersedes the accepted one.
    const current = await built.app.inject({ method: "GET", url: "/api/recommendations/current", headers: auth });
    expect(current.statusCode).toBe(200);
    const currentBody = (current.json() as { recommendation: { id: string; status: string } }).recommendation;
    expect(currentBody.status).toBe("active");
    expect(currentBody.id).not.toBe(initial.id);
  });
});
