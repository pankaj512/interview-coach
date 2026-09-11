// Seeds the canonical DSA catalog (repo-root dsa-problem-catalog.json,
// 59 topics / 300 problems) into Postgres via importCatalogTopics.
// Idempotent: ProblemRepository.save upserts on stable slug IDs
// (prob_<slug>), so re-running is safe across restarts.
// Usage: `pnpm --filter @interview-coach/db db:seed`.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  importCatalogTopics,
  type CatalogTopicRaw,
} from "@interview-coach/domain";
import { createDatabase } from "./client.js";
import { DrizzleProblemRepository } from "./repositories.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "../../../dsa-problem-catalog.json");

const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
  topics: readonly CatalogTopicRaw[];
};

const { problems, errors } = importCatalogTopics(catalog.topics);
for (const e of errors) {
  console.warn(`seed skip [${e.topic}] ${e.title}: ${e.message}`);
}

const handle = createDatabase();
const repo = new DrizzleProblemRepository(handle.db);
for (const problem of problems) await repo.save(problem);
console.log(`seeded ${problems.length} problems (${errors.length} skipped)`);
await handle.close();
