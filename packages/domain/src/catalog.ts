import type { ProblemId, TopicId } from "./ids.js";
import { asProblemId, asTopicId } from "./ids.js";
import type { Problem } from "./problem.js";
import { createProblem, parseDifficulty, slugifyTitle } from "./problem.js";
import type { Result } from "./result.js";
import { err } from "./result.js";
import { domainError } from "./errors.js";

// Pure import of the canonical catalog (raw_content/dsa/dsa-problem-catalog.json:
// 59 topics / 300 problems, fields title/difficulty/DSA/leetcode) into
// Problem entities. Deterministic stable IDs (slug-based) so S2 seeding is
// repeatable across restarts. No I/O here; callers read the JSON file.
export interface CatalogProblemRaw {
  readonly title: string;
  readonly difficulty: string;
  readonly DSA?: string;
  readonly leetcode?: string;
}

export interface CatalogTopicRaw {
  readonly topic: string;
  readonly problems: readonly CatalogProblemRaw[];
}

export interface CatalogImportError {
  readonly topic: string;
  readonly title: string;
  readonly message: string;
}

export interface CatalogImportResult {
  readonly problems: readonly Problem[];
  readonly errors: readonly CatalogImportError[];
}

export function problemIdForTitle(title: string): ProblemId {
  return asProblemId(`prob_${slugifyTitle(title)}`);
}

// Stable curriculum topic ID from the catalog/curriculum topic name (Phase 3).
// Topic names are unique across the canonical curriculum (59 topics), so the
// slug is collision-free; seeded rows keep the same ID across restarts.
export function topicIdForName(name: string): TopicId {
  return asTopicId(`topic_${slugifyTitle(name)}`);
}

export function importCatalogProblem(
  topic: string,
  raw: CatalogProblemRaw,
): Result<Problem> {
  const difficulty = parseDifficulty(raw.difficulty);
  if (!difficulty.ok) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `Skipping "${raw.title}" (${topic}): ${difficulty.error.message}`,
      ),
    );
  }
  return createProblem({
    id: problemIdForTitle(raw.title),
    title: raw.title,
    difficulty: difficulty.value,
    topicId: topicIdForName(topic),
    expectedConcepts: [topic],
    ...(raw.DSA === undefined && raw.leetcode === undefined
      ? {}
      : {
          sourceLinks: {
            ...(raw.DSA === undefined ? {} : { DSA: raw.DSA }),
            ...(raw.leetcode === undefined ? {} : { leetcode: raw.leetcode }),
          },
        }),
  });
}

export function importCatalogTopics(
  topics: readonly CatalogTopicRaw[],
): CatalogImportResult {
  const problems: Problem[] = [];
  const errors: CatalogImportError[] = [];
  const seen = new Set<ProblemId>();
  for (const { topic, problems: entries } of topics) {
    for (const raw of entries) {
      const id = problemIdForTitle(raw.title);
      if (seen.has(id)) {
        errors.push({
          topic,
          title: raw.title,
          message: `Duplicate problem id ${id}; keeping first occurrence`,
        });
        continue;
      }
      const imported = importCatalogProblem(topic, raw);
      if (!imported.ok) {
        errors.push({ topic, title: raw.title, message: imported.error.message });
        continue;
      }
      seen.add(id);
      problems.push(imported.value);
    }
  }
  return { problems, errors };
}
