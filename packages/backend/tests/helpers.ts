// Shared S3 backend test harness: in-memory repos + fake voice provider.
// No DB required, so `pnpm test` stays green without Postgres.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  asProblemId,
  createInMemoryRepositories,
  importCatalogTopics,
  importCurriculum,
  type CurriculumRaw,
  type EvaluationModel,
  type RecommendationModel,
  type RepositorySet,
  type SubmitVerdictModel,
} from "@interview-coach/domain";
import { buildApp, type BuiltBackend } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { FakeVoiceSessionProvider } from "../src/voice-session.js";

export interface TestBackend extends BuiltBackend {
  readonly repos: RepositorySet;
}

export function buildTestBackend(
  options: {
    readonly recommendationModel?: RecommendationModel;
    readonly evaluationModel?: EvaluationModel;
    readonly submitVerdictModel?: SubmitVerdictModel;
  } = {},
): TestBackend {
  const repos = createInMemoryRepositories();
  const built = buildApp({
    repos,
    config: loadConfig({
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "3000",
      CORS_ORIGIN: "http://localhost:5173",
    }),
    voiceProvider: new FakeVoiceSessionProvider(),
    ...(options.recommendationModel === undefined
      ? {}
      : { recommendationModel: options.recommendationModel }),
    ...(options.evaluationModel === undefined
      ? {}
      : { evaluationModel: options.evaluationModel }),
    ...(options.submitVerdictModel === undefined
      ? {}
      : { submitVerdictModel: options.submitVerdictModel }),
    // Phase 10: run the evaluation job inline so HTTP tests are deterministic.
    evaluationRunSynchronously: true,
    logger: false,
  });
  return { ...built, repos };
}

export async function seedProblem(
  repos: RepositorySet,
  id = "prob_two-sum",
  title = "Two Sum",
): Promise<void> {
  await repos.problems.save({
    id: asProblemId(id),
    title,
    difficulty: "Easy",
  });
}

// Phase 3: load the real catalog + curriculum into in-memory repos so the
// curriculum routes serve the same data Postgres seeds.
export async function seedCurriculum(repos: RepositorySet): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const catalog = JSON.parse(
    readFileSync(resolve(here, "../../../raw_content/dsa/dsa-problem-catalog.json"), "utf8"),
  ) as { topics: { topic: string; problems: { title: string; difficulty: string }[] }[] };
  const raw = JSON.parse(
    readFileSync(resolve(here, "../../../content/dsa/dsa-interview-curriculum.json"), "utf8"),
  ) as CurriculumRaw;
  const { problems } = importCatalogTopics(catalog.topics);
  for (const problem of problems) await repos.problems.save(problem);
  const { curriculum } = importCurriculum(raw, {
    knownProblemTitles: new Set(problems.map((p) => p.title)),
  });
  await repos.curricula.save(curriculum);
}

export interface StartedInterview {
  readonly id: string;
}

function bodyOf(response: { body: string }): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

// Full setup flow over HTTP: create -> assign -> ready -> start.
export async function createStartedInterview(
  backend: TestBackend,
  problemIds: readonly string[] = [],
): Promise<StartedInterview> {
  const created = await backend.app.inject({
    method: "POST",
    url: "/api/interviews",
    payload: {
      candidateId: "user_test",
      configuration: { interviewType: "dsa" },
    },
  });
  if (created.statusCode !== 201) throw new Error(`create failed: ${created.body}`);
  const id = (bodyOf(created)["interview"] as { id: string }).id;
  if (problemIds.length > 0) {
    const assigned = await backend.app.inject({
      method: "POST",
      url: `/api/interviews/${id}/problems`,
      payload: { problemIds: [...problemIds] },
    });
    if (assigned.statusCode !== 200) throw new Error(`assign failed: ${assigned.body}`);
  }
  const ready = await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/ready` });
  if (ready.statusCode !== 200) throw new Error(`ready failed: ${ready.body}`);
  const started = await backend.app.inject({ method: "POST", url: `/api/interviews/${id}/start` });
  if (started.statusCode !== 200) throw new Error(`start failed: ${started.body}`);
  return { id };
}
