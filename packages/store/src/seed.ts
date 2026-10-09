// Seeds the catalog and curriculum into Postgres.
//
// Owns: the idempotent one-off import (upserts on stable slug IDs, safe
// across restarts). Surprising: run explicitly via db:seed, never
// automatically.
//
// History: see docs/SESSION_HANDOFF.md.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  createProblem,
  importCatalogTopics,
  importCurriculum,
  type CatalogTopicRaw,
  type CurriculumRaw,
  type Problem,
  type ProblemExample,
  type ProblemRunnerLinks,
  type ProblemStarters,
} from "@interview-coach/core";
import { createDatabase } from "./client.js";
import { DrizzleCurriculumRepository, DrizzleProblemRepository } from "./repositories.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "../../../raw_content/dsa/dsa-problem-catalog.json");
const curriculumPath = resolve(here, "../../../content/dsa/dsa-interview-curriculum.json");
// Feature 18b: cleaned 18a dataset (verbatim starters + runner links).
const datasetPath = resolve(here, "../../../content/dsa/problem-content-enrichment.json");

const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
  topics: readonly CatalogTopicRaw[];
};
const curriculumRaw = JSON.parse(await readFile(curriculumPath, "utf8")) as CurriculumRaw;

interface DatasetRunnerLink {
  readonly runnerId?: unknown;
  readonly entry?: unknown;
  readonly className?: unknown;
  readonly actualRule?: unknown;
}

interface DatasetProblem {
  readonly id?: unknown;
  readonly description?: unknown;
  readonly constraints?: unknown;
  readonly examples?: unknown;
  readonly starters?: {
    readonly cpp?: unknown;
    readonly javascript?: unknown;
    readonly python?: unknown;
  };
  readonly python?: DatasetRunnerLink;
  readonly javascript?: DatasetRunnerLink;
  readonly cpp?: DatasetRunnerLink;
}

const ACTUAL_RULES = new Set(["pure", "in-place", "method-sequence"]);

function toRunnerLink(
  raw: DatasetRunnerLink | undefined,
  problemId: string,
  language: string,
): ProblemRunnerLinks[keyof ProblemRunnerLinks] | undefined {
  if (raw === undefined) return undefined;
  if (
    typeof raw.runnerId !== "string" ||
    typeof raw.entry !== "string" ||
    typeof raw.className !== "string" ||
    typeof raw.actualRule !== "string" ||
    !ACTUAL_RULES.has(raw.actualRule)
  ) {
    console.warn(
      `seed skip link [${problemId}] ${language}: malformed runner link ` +
        `(expected string runnerId/entry/className and pure|in-place|method-sequence actualRule)`,
    );
    return undefined;
  }
  return {
    runnerId: raw.runnerId,
    entry: raw.entry,
    className: raw.className,
    actualRule: raw.actualRule as "pure" | "in-place" | "method-sequence",
  };
}

function cleanCopyText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const out = value.replace(/\r\n/g, "\n").trim();
  return out.length > 0 ? out : undefined;
}

function toCopyExample(raw: unknown): ProblemExample | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const e = raw as { input?: unknown; output?: unknown; explanation?: unknown };
  const input = cleanCopyText(e.input);
  const output = cleanCopyText(e.output);
  if (input === undefined || output === undefined) return undefined;
  const explanation = cleanCopyText(e.explanation);
  return explanation === undefined ? { input, output } : { input, output, explanation };
}

function toCopyConstraints(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.flatMap((c) => {
    const t = cleanCopyText(c);
    return t === undefined ? [] : [t];
  });
  return out.length > 0 ? out : undefined;
}

function toCopyExamples(raw: unknown): ProblemExample[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.flatMap((e) => {
    const t = toCopyExample(e);
    return t === undefined ? [] : [t];
  });
  return out.length > 0 ? out : undefined;
}

// Merge the cleaned dataset onto the imported catalog problems. Problems
// without a usable dataset record seed title-only (gap); dataset content is
// carried verbatim, never invented.
async function mergeDataset(problems: readonly Problem[]): Promise<{
  merged: Problem[];
  enriched: number;
  gaps: string[];
}> {
  let records: readonly DatasetProblem[];
  try {
    const raw = JSON.parse(await readFile(datasetPath, "utf8")) as {
      problems?: readonly DatasetProblem[];
    };
    if (!Array.isArray(raw.problems) || raw.problems.length === 0) {
      throw new Error("dataset file holds zero problem records");
    }
    records = raw.problems;
  } catch (error) {
    // F-05: a missing/unparseable/empty dataset must abort before any upsert.
    // Falling through here would reseed all 300 catalog rows title-only and,
    // via onConflictDoUpdate, wipe existing enrichment.
    throw new Error(
      `seed abort: cannot load dataset ${datasetPath}: ${(error as Error).message}`,
    );
  }
  const byId = new Map<string, DatasetProblem>();
  for (const r of records) {
    if (typeof r.id === "string") byId.set(r.id, r);
  }
  const merged: Problem[] = [];
  const gaps: string[] = [];
  let enriched = 0;
  for (const problem of problems) {
    const record = byId.get(problem.id);
    const starters =
      record !== undefined &&
      typeof record.starters?.cpp === "string" &&
      typeof record.starters?.javascript === "string" &&
      typeof record.starters?.python === "string"
        ? ({
            cpp: record.starters.cpp,
            javascript: record.starters.javascript,
            python: record.starters.python,
          } satisfies ProblemStarters)
        : undefined;
    const pythonLink = toRunnerLink(record?.python, problem.id, "python");
    const javascriptLink = toRunnerLink(record?.javascript, problem.id, "javascript");
    const cppLink = toRunnerLink(record?.cpp, problem.id, "cpp");
    const runnerLinks: ProblemRunnerLinks = {
      ...(pythonLink === undefined ? {} : { python: pythonLink }),
      ...(javascriptLink === undefined ? {} : { javascript: javascriptLink }),
      ...(cppLink === undefined ? {} : { cpp: cppLink }),
    };
    if (starters === undefined && Object.keys(runnerLinks).length === 0) {
      gaps.push(`${problem.id} (no usable dataset record)`);
      merged.push(problem);
      continue;
    }
    // Dataset copy is preferred verbatim; malformed fields fall back to the
    // catalog row (title-only) for that field, never invented.
    const description = cleanCopyText(record?.description) ?? problem.description;
    const constraints = toCopyConstraints(record?.constraints) ?? problem.constraints;
    const examples = toCopyExamples(record?.examples) ?? problem.examples;
    const rebuilt = createProblem({
      id: problem.id,
      title: problem.title,
      difficulty: problem.difficulty,
      ...(problem.topicId === undefined ? {} : { topicId: problem.topicId }),
      ...(description === undefined ? {} : { description }),
      ...(constraints === undefined ? {} : { constraints }),
      ...(examples === undefined ? {} : { examples }),
      ...(problem.expectedConcepts === undefined
        ? {}
        : { expectedConcepts: problem.expectedConcepts }),
      ...(problem.sourceLinks === undefined ? {} : { sourceLinks: problem.sourceLinks }),
      ...(problem.evaluationCriteria === undefined
        ? {}
        : { evaluationCriteria: problem.evaluationCriteria }),
      ...(starters === undefined ? {} : { starters }),
      ...(Object.keys(runnerLinks).length === 0 ? {} : { runnerLinks }),
    });
    if (!rebuilt.ok) {
      gaps.push(`${problem.id} (rebuild failed: ${rebuilt.error.message})`);
      merged.push(problem);
      continue;
    }
    if (starters !== undefined) enriched += 1;
    else gaps.push(`${problem.id} (links only, no starters)`);
    merged.push(rebuilt.value);
  }
  return { merged, enriched, gaps };
}

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
// Enrich with the cleaned 18a dataset; gaps seed title-only. A missing or
// empty dataset aborts before any upsert (F-05) to protect enrichment.
let seedProblems: Problem[];
let enriched: number;
let gaps: string[];
try {
  ({ merged: seedProblems, enriched, gaps } = await mergeDataset(problems));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await handle.close();
  process.exit(1);
}
const problemRepo = new DrizzleProblemRepository(handle.db);
for (const problem of seedProblems) await problemRepo.save(problem);
const curriculumRepo = new DrizzleCurriculumRepository(handle.db);
await curriculumRepo.save(curriculum);
console.log(
  `seeded ${seedProblems.length} problems (${errors.length} skipped), ` +
    `curriculum ${curriculum.id} v${curriculum.version} ` +
    `(${curriculum.modules.length} modules / ${curriculum.topics.length} topics, ` +
    `${curriculumErrors.length} skipped)`,
);
console.log(`enriched ${enriched} problems with starters, ${gaps.length} title-only gaps`);
for (const gapLine of gaps) console.log(`gap ${gapLine}`);
await handle.close();
