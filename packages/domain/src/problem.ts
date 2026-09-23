import type { ProblemId, TopicId } from "./ids.js";
import { newProblemId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Canonical problem owned by the backend (HLD 5.4). Catalog entries
// (dsa-problem-catalog.json: title/difficulty/DSA/leetcode) import into
// this shape via catalog.ts; description/constraints/examples accrue later.
export type ProblemDifficulty = "Easy" | "Medium" | "Hard";

export interface ProblemExample {
  readonly input: string;
  readonly output: string;
  readonly explanation?: string;
}

export interface ProblemSourceLinks {
  readonly DSA?: string;
  readonly leetcode?: string;
}

// Verbatim LeetCode starter skeletons per language, carried from the frozen
// problem-content dataset (feature 18b). Shown to the user as-is.
export interface ProblemStarters {
  readonly cpp: string;
  readonly javascript: string;
  readonly python: string;
}

export type ProblemActualRule = "pure" | "in-place" | "method-sequence";

// Shared shape-runner link per language, carried from the frozen dataset.
// Method-sequence links store entry verbatim as "" (dispatch is per-op).
export interface ProblemRunnerLink {
  readonly runnerId: string;
  readonly entry: string;
  readonly className: string;
  readonly actualRule: ProblemActualRule;
}

export interface ProblemRunnerLinks {
  readonly python?: ProblemRunnerLink;
  readonly javascript?: ProblemRunnerLink;
  readonly cpp?: ProblemRunnerLink;
}

export interface Problem {
  readonly id: ProblemId;
  readonly title: string;
  readonly difficulty: ProblemDifficulty;
  /** Curriculum topic this problem belongs to (learning-loop Phase 3). */
  readonly topicId?: TopicId;
  readonly description?: string;
  readonly constraints?: readonly string[];
  readonly examples?: readonly ProblemExample[];
  readonly expectedConcepts?: readonly string[];
  readonly sourceLinks?: ProblemSourceLinks;
  readonly evaluationCriteria?: readonly string[];
  readonly starters?: ProblemStarters;
  readonly runnerLinks?: ProblemRunnerLinks;
}

export interface CreateProblemInput {
  readonly id?: ProblemId;
  readonly title: string;
  readonly difficulty: ProblemDifficulty;
  readonly topicId?: TopicId;
  readonly description?: string;
  readonly constraints?: readonly string[];
  readonly examples?: readonly ProblemExample[];
  readonly expectedConcepts?: readonly string[];
  readonly sourceLinks?: ProblemSourceLinks;
  readonly evaluationCriteria?: readonly string[];
  readonly starters?: ProblemStarters;
  readonly runnerLinks?: ProblemRunnerLinks;
}

export function parseDifficulty(raw: string): Result<ProblemDifficulty> {
  if (raw === "Easy" || raw === "Medium" || raw === "Hard") return ok(raw);
  return err(
    domainError("VALIDATION_ERROR", `Unknown difficulty: ${raw}`, {
      raw,
      allowed: ["Easy", "Medium", "Hard"],
    }),
  );
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createProblem(input: CreateProblemInput): Result<Problem> {
  const title = input.title.trim();
  if (title.length === 0) {
    return err(domainError("VALIDATION_ERROR", "Problem title must not be empty"));
  }
  const problem: Problem = {
    id: input.id ?? newProblemId(),
    title,
    difficulty: input.difficulty,
    ...(input.topicId === undefined ? {} : { topicId: input.topicId }),
    ...(input.description === undefined
      ? {}
      : { description: input.description.trim() }),
    ...(input.constraints === undefined ? {} : { constraints: input.constraints }),
    ...(input.examples === undefined ? {} : { examples: input.examples }),
    ...(input.expectedConcepts === undefined
      ? {}
      : { expectedConcepts: input.expectedConcepts }),
    ...(input.sourceLinks === undefined ? {} : { sourceLinks: input.sourceLinks }),
    ...(input.evaluationCriteria === undefined
      ? {}
      : { evaluationCriteria: input.evaluationCriteria }),
    ...(input.starters === undefined ? {} : { starters: input.starters }),
    ...(input.runnerLinks === undefined ? {} : { runnerLinks: input.runnerLinks }),
  };
  return ok(problem);
}
