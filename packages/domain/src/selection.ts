// @interview-coach/domain - deterministic problem selection (HLD 5.1 / S5).
//
// Pure function over backend-owned problems. No I/O, no randomness: the same
// catalog + configuration always yields the same ordered selection, so
// auto-select is replay-safe and testable. Curriculum order is an optional
// pedagogical bias (content/dsa/dsa-interview-curriculum.json title order); unknown
// titles fall back to a stable (difficulty, title) sort.

import type { ProblemId } from "./ids.js";
import type { InterviewDifficulty } from "./interview.js";
import type { Problem, ProblemDifficulty } from "./problem.js";

export interface SelectProblemsInput {
  readonly problems: readonly Problem[];
  /** Defaults to "Mixed" (no difficulty filter). */
  readonly difficulty?: InterviewDifficulty | ProblemDifficulty;
  /** Topic filter: matches Problem.expectedConcepts (case-insensitive). */
  readonly topicFocus?: readonly string[];
  /** Defaults to 1. Clamped to 1..20. */
  readonly count?: number;
  /** Already-seen problems to skip (stable IDs). */
  readonly excludeIds?: readonly ProblemId[];
  /**
   * Optional pedagogical order: problem titles earliest-first (curriculum
   * default progression). Titles not listed sort after listed ones.
   */
  readonly curriculumOrder?: readonly string[];
}

const DIFFICULTY_RANK: Record<ProblemDifficulty, number> = {
  Easy: 0,
  Medium: 1,
  Hard: 2,
};

function matchesDifficulty(
  problem: Problem,
  difficulty: InterviewDifficulty | ProblemDifficulty | undefined,
): boolean {
  if (difficulty === undefined || difficulty === "Mixed") return true;
  if (difficulty === "Easy" || difficulty === "Medium" || difficulty === "Hard") {
    return problem.difficulty === difficulty;
  }
  return true;
}

function matchesTopics(problem: Problem, topicFocus: readonly string[] | undefined): boolean {
  if (topicFocus === undefined || topicFocus.length === 0) return true;
  const concepts = (problem.expectedConcepts ?? []).map((c) => c.toLowerCase());
  return topicFocus.some((t) => {
    const needle = t.trim().toLowerCase();
    if (needle === "") return false;
    return concepts.some((c) => c === needle || c.includes(needle) || needle.includes(c));
  });
}

export function selectProblems(input: SelectProblemsInput): readonly Problem[] {
  const countRaw = input.count ?? 1;
  const count = Math.min(20, Math.max(1, Math.floor(countRaw)));
  const excluded = new Set<ProblemId>(input.excludeIds ?? []);
  const rank = new Map<string, number>();
  if (input.curriculumOrder !== undefined) {
    input.curriculumOrder.forEach((title, i) => {
      rank.set(title.trim().toLowerCase(), i);
    });
  }
  const candidates = input.problems.filter(
    (p) =>
      !excluded.has(p.id) &&
      matchesDifficulty(p, input.difficulty) &&
      matchesTopics(p, input.topicFocus),
  );
  candidates.sort((a, b) => {
    const ra = rank.get(a.title.trim().toLowerCase());
    const rb = rank.get(b.title.trim().toLowerCase());
    if (ra !== undefined || rb !== undefined) {
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      if (ra !== rb) return ra - rb;
    }
    const da = DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
    if (da !== 0) return da;
    return a.title.localeCompare(b.title);
  });
  return candidates.slice(0, count);
}

export function selectProblemIds(input: SelectProblemsInput): readonly ProblemId[] {
  return selectProblems(input).map((p) => p.id);
}
