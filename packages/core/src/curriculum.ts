// @interview-coach/core - server-owned curriculum over the problem catalog.
//
// Owns: the pedagogical ordering (12 modules / 59 topics / 300 problems) and
// the pure, deterministic catalog import (stable slug IDs, idempotent seed).
// Surprising: backend-owned static configuration, never bundled to the browser.
//
// History: Phase 3; see docs/SESSION_HANDOFF.md.

import type {
  CurriculumId,
  ModuleId,
  ProblemId,
  TopicId,
} from "./ids.js";
import { asCurriculumId, asModuleId } from "./ids.js";
import type { InterviewType } from "./interview.js";
import { problemIdForTitle, topicIdForName } from "./catalog.js";
import { slugifyTitle } from "./problem.js";

// v1: exactly one curriculum, one-to-one with the only interview type.
export const DSA_CURRICULUM_ID: CurriculumId = asCurriculumId("dsa");

export function moduleIdFor(
  curriculumId: CurriculumId,
  rawModuleId: string,
): ModuleId {
  return asModuleId(`module_${slugifyTitle(curriculumId)}_${slugifyTitle(rawModuleId)}`);
}

export interface CurriculumTopic {
  readonly id: TopicId;
  readonly curriculumId: CurriculumId;
  readonly moduleId: ModuleId;
  /** 1-based order across the whole curriculum (the default progression). */
  readonly order: number;
  readonly name: string;
  /** Catalog problem IDs, in the curriculum's within-topic order. */
  readonly problemIds: readonly ProblemId[];
}

export interface CurriculumModule {
  readonly id: ModuleId;
  readonly curriculumId: CurriculumId;
  /** 1-based module order. */
  readonly order: number;
  readonly name: string;
  readonly objective?: string;
  readonly topicIds: readonly TopicId[];
}

export interface Curriculum {
  readonly id: CurriculumId;
  readonly interviewType: InterviewType;
  readonly name: string;
  readonly version: number;
  readonly modules: readonly CurriculumModule[];
  readonly topics: readonly CurriculumTopic[];
}

// Untyped import shape (the repo-root JSON). The importer is the validation
// boundary, so every field arrives loose.
export interface CurriculumRawTopic {
  readonly topic?: unknown;
  readonly problem_titles?: unknown;
}

export interface CurriculumRawModule {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly objective?: unknown;
  readonly topics?: unknown;
}

export interface CurriculumRaw {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly modules?: unknown;
}

export interface CurriculumImportError {
  readonly moduleId?: string;
  readonly topic?: string;
  readonly title?: string;
  readonly message: string;
}

export interface CurriculumImportResult {
  readonly curriculum: Curriculum;
  readonly errors: readonly CurriculumImportError[];
}

export interface CurriculumImportOptions {
  /** Canonical catalog titles; unknown references are reported (not fatal). */
  readonly knownProblemTitles?: ReadonlySet<string>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

// Imports the raw curriculum JSON into entities. Deterministic and
// idempotent: identical input always yields identical IDs + order. Unknown
// problem titles are reported in `errors` but skipped, so a partial catalog
// still imports rather than failing the whole seed.
export function importCurriculum(
  raw: CurriculumRaw,
  options: CurriculumImportOptions = {},
): CurriculumImportResult {
  const errors: CurriculumImportError[] = [];
  const name = asString(raw.name) ?? "Data Structures & Algorithms Curriculum";
  const version =
    typeof raw.version === "number" && Number.isInteger(raw.version)
      ? raw.version
      : 1;
  const curriculumId = DSA_CURRICULUM_ID;

  const modules: CurriculumModule[] = [];
  const topics: CurriculumTopic[] = [];
  const seenModuleIds = new Set<ModuleId>();
  const seenTopicIds = new Set<TopicId>();
  let topicOrder = 0;

  const rawModules = asArray(raw.modules);
  rawModules.forEach((rawModule, moduleIndex) => {
    if (typeof rawModule !== "object" || rawModule === null) {
      errors.push({ message: `Module #${moduleIndex + 1} is not an object` });
      return;
    }
    const module = rawModule as CurriculumRawModule;
    const rawModuleId = asString(module.id) ?? String(moduleIndex + 1);
    const moduleId = moduleIdFor(curriculumId, rawModuleId);
    if (seenModuleIds.has(moduleId)) {
      errors.push({
        moduleId: rawModuleId,
        message: `Duplicate module id ${moduleId}; keeping first occurrence`,
      });
      return;
    }
    seenModuleIds.add(moduleId);
    const moduleName = asString(module.name) ?? `Module ${rawModuleId}`;
    const objective = asString(module.objective) ?? undefined;
    const topicIds: TopicId[] = [];

    for (const rawTopic of asArray(module.topics)) {
      if (typeof rawTopic !== "object" || rawTopic === null) {
        errors.push({ moduleId: rawModuleId, message: "Topic entry is not an object" });
        continue;
      }
      const topic = rawTopic as CurriculumRawTopic;
      const topicName = asString(topic.topic);
      if (topicName === null) {
        errors.push({ moduleId: rawModuleId, message: "Topic has no name" });
        continue;
      }
      const topicId = topicIdForName(topicName);
      if (seenTopicIds.has(topicId)) {
        errors.push({
          moduleId: rawModuleId,
          topic: topicName,
          message: `Duplicate topic id ${topicId}; keeping first occurrence`,
        });
        continue;
      }
      seenTopicIds.add(topicId);

      const problemIds: ProblemId[] = [];
      const seenProblems = new Set<ProblemId>();
      for (const rawTitle of asArray(topic.problem_titles)) {
        const title = asString(rawTitle);
        if (title === null) {
          errors.push({
            moduleId: rawModuleId,
            topic: topicName,
            message: "Problem title must be a non-empty string",
          });
          continue;
        }
        if (
          options.knownProblemTitles !== undefined &&
          !options.knownProblemTitles.has(title)
        ) {
          errors.push({
            moduleId: rawModuleId,
            topic: topicName,
            title,
            message: `Problem title not found in the catalog: "${title}"`,
          });
          continue;
        }
        const problemId = problemIdForTitle(title);
        if (seenProblems.has(problemId)) {
          errors.push({
            moduleId: rawModuleId,
            topic: topicName,
            title,
            message: `Duplicate problem in topic: ${problemId}`,
          });
          continue;
        }
        seenProblems.add(problemId);
        problemIds.push(problemId);
      }

      topicOrder += 1;
      topicIds.push(topicId);
      topics.push({
        id: topicId,
        curriculumId,
        moduleId,
        order: topicOrder,
        name: topicName,
        problemIds,
      });
    }

    modules.push({
      id: moduleId,
      curriculumId,
      order: moduleIndex + 1,
      name: moduleName,
      ...(objective === undefined ? {} : { objective }),
      topicIds,
    });
  });

  return {
    curriculum: {
      id: curriculumId,
      interviewType: "dsa",
      name,
      version,
      modules,
      topics,
    },
    errors,
  };
}

// Convenience lookup used by services/tests: topic by stable id.
export function findCurriculumTopic(
  curriculum: Curriculum,
  topicId: TopicId,
): CurriculumTopic | null {
  return curriculum.topics.find((topic) => topic.id === topicId) ?? null;
}
