// Seeds the canonical DSA catalog (repo-root dsa-problem-catalog.json,
// 59 topics / 300 problems) and the server-owned curriculum
// (dsa-interview-curriculum.json: 12 modules / 59 topics / 300 problems)
// into Postgres.
// Idempotent: ProblemRepository.save upserts on stable slug IDs
// (prob_<slug>), and CurriculumRepository.save replaces the curriculum tree,
// so re-running is safe across restarts.
// Usage: `pnpm --filter @interview-coach/db db:seed`.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  importCatalogTopics,
  importCurriculum,
  type CatalogTopicRaw,
  type CurriculumRaw,
} from "@interview-coach/domain";
import { createDatabase } from "./client.js";
import { DrizzleCurriculumRepository, DrizzleProblemRepository } from "./repositories.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "../../../dsa-problem-catalog.json");
const curriculumPath = resolve(here, "../../../dsa-interview-curriculum.json");

const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
  topics: readonly CatalogTopicRaw[];
};
const curriculumRaw = JSON.parse(await readFile(curriculumPath, "utf8")) as CurriculumRaw;

const { problems, errors } = importCatalogTopics(catalog.topics);
for (const e of errors) {
  console.warn(`seed skip [${e.topic}] ${e.title}: ${e.message}`);
}

const knownProblemTitles = new Set(problems.map((p) => p.title));
const { curriculum, errors: curriculumErrors } = importCurriculum(curriculumRaw, {
  knownProblemTitles,
});
for (const e of curriculumErrors) {
  console.warn(`curriculum skip [${e.moduleId ?? "?"}] ${e.topic ?? ""}: ${e.message}`);
}

const handle = createDatabase();
// Problems first: curriculum_topic_problems references problems(id).
const problemRepo = new DrizzleProblemRepository(handle.db);
for (const problem of problems) await problemRepo.save(problem);
const curriculumRepo = new DrizzleCurriculumRepository(handle.db);
await curriculumRepo.save(curriculum);
console.log(
  `seeded ${problems.length} problems (${errors.length} skipped), ` +
    `curriculum ${curriculum.id} v${curriculum.version} ` +
    `(${curriculum.modules.length} modules / ${curriculum.topics.length} topics, ` +
    `${curriculumErrors.length} skipped)`,
);
await handle.close();
