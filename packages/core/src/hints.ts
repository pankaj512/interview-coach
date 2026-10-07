// @interview-coach/core - controlled hint policy (HLD 5.4 / S5).
//
// Three deterministic tiers; the interviewer guides without revealing the
// solution. Hints never contain final code. Level defaults to
// nextHintLevel(hintsUsed): first hint is conceptual, then approach scaffold,
// then a detailed plan - capped at 3 so heavy hinting degrades gracefully
// and is visible in evaluation (hintsUsed).

import type { Problem } from "./problem.js";

export const MAX_HINT_LEVEL = 3 as const;
export type HintLevel = 1 | 2 | 3;

export interface BuiltHint {
  readonly level: HintLevel;
  readonly hint: string;
  /** Always false: hints guide, they never contain the final solution. */
  readonly revealsSolution: false;
}

export function nextHintLevel(hintsUsed: number): HintLevel {
  if (!Number.isInteger(hintsUsed) || hintsUsed < 0) return 1;
  const next = hintsUsed + 1;
  if (next >= MAX_HINT_LEVEL) return MAX_HINT_LEVEL;
  return next as HintLevel;
}

export function parseHintLevel(raw: unknown): HintLevel | null {
  if (raw === undefined) return null;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

export function buildHint(problem: Problem, level: HintLevel): BuiltHint {
  const concepts =
    problem.expectedConcepts !== undefined && problem.expectedConcepts.length > 0
      ? problem.expectedConcepts.join(", ")
      : "the core pattern behind this problem";
  const constraints =
    problem.constraints !== undefined && problem.constraints.length > 0
      ? ` Keep the constraints in mind (${problem.constraints.length} listed).`
      : "";
  if (level === 1) {
    return {
      level,
      revealsSolution: false,
      hint: `Conceptual nudge for "${problem.title}" (${problem.difficulty}): think about which pattern fits (${concepts}). Restate the input/output in your own words and name one brute-force approach before optimizing.${constraints}`,
    };
  }
  if (level === 2) {
    return {
      level,
      revealsSolution: false,
      hint: `Approach scaffold for "${problem.title}": outline 2 candidate approaches, compare their time/space complexity, then pick one. Walk through your plan on a small example and name the edge cases you must handle.${constraints}`,
    };
  }
  return {
    level,
    revealsSolution: false,
    hint: `Detailed plan for "${problem.title}": break the solution into 3-5 concrete steps with invariants for each step, then dry-run the steps on two examples (one typical, one edge case). State the final complexity before writing code - the implementation itself is still yours to produce.`,
  };
}
