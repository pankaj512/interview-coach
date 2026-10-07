// @interview-coach/core - evaluation model port + proposal validation +
// deterministic fallback (learning-loop Phase 10).
//
// Mirrors the Phase 4 recommendation model: the backend assembles the input,
// the (server-side) LLM proposes a structured evaluation, and the backend
// validates it. When the model is unconfigured, errors, or returns an invalid
// shape, the deterministic fallback produces a grounded evaluation from
// persisted signals (hints, responses, code, runs) so the learning loop stays
// functional without an LLM (ADR-002).

import type {
  EvaluationDimension,
  DimensionScore,
} from "./evaluation.js";
import { EVALUATION_DIMENSIONS } from "./evaluation.js";
import type { InterviewConfiguration, InterviewStatus } from "./interview.js";
import type { Problem } from "./problem.js";
import type { UserProfile } from "./profile.js";
import type { UserSkillState } from "./skill.js";
import type { ResponseKind } from "./candidate-response.js";
import type { RunStatus } from "./submission.js";

export interface EvaluationProposal {
  readonly dimensions: Partial<Record<EvaluationDimension, DimensionScore>>;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
}

export interface EvaluationModelTopic {
  readonly id: string;
  readonly name: string;
  readonly moduleName?: string;
  readonly objective?: string;
}

export interface EvaluationModelInput {
  readonly interviewId: string;
  readonly candidateId: string;
  readonly status: InterviewStatus;
  readonly configuration: InterviewConfiguration;
  readonly problem: Problem | null;
  readonly topic: EvaluationModelTopic | null;
  readonly profile: UserProfile | null;
  readonly skillState: UserSkillState | null;
  readonly transcript: readonly { readonly role: string; readonly content: string }[];
  readonly responses: readonly { readonly kind: ResponseKind; readonly content: string }[];
  readonly submissions: readonly { readonly language: string; readonly codeLength: number }[];
  readonly runs: readonly {
    readonly status: RunStatus;
    readonly passedCount: number;
    readonly totalCount: number;
  }[];
  readonly hintsUsed: number;
}

export interface EvaluationModelResult {
  readonly proposal: EvaluationProposal | null;
  readonly error?: string;
}

// The model/app boundary: proposal in, backend validates + persists.
export interface EvaluationModel {
  readonly name: string;
  evaluate(input: EvaluationModelInput): Promise<EvaluationModelResult>;
}

const MAX_NOTE_LENGTH = 400;
const MAX_ITEMS = 12;

function clampScore(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value)));
}

// Validates an untrusted proposal shape. Returns null when it cannot be used,
// so the caller can fall back. Unknown dimension keys are rejected (a typo
// must not persist a phantom dimension).
export function validateEvaluationProposal(raw: unknown): EvaluationProposal | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const rawDimensions = record["dimensions"];
  const dimensions: Partial<Record<EvaluationDimension, DimensionScore>> = {};
  if (typeof rawDimensions === "object" && rawDimensions !== null && !Array.isArray(rawDimensions)) {
    for (const [key, value] of Object.entries(rawDimensions as Record<string, unknown>)) {
      if (!(EVALUATION_DIMENSIONS as readonly string[]).includes(key)) return null;
      if (typeof value !== "object" || value === null) return null;
      const entry = value as Record<string, unknown>;
      const score = entry["score"];
      if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 5) {
        return null;
      }
      const notes = entry["notes"];
      if (notes !== undefined && typeof notes !== "string") return null;
      const trimmed = typeof notes === "string" ? notes.trim() : "";
      dimensions[key as EvaluationDimension] = {
        score,
        ...(trimmed === "" ? {} : { notes: trimmed.slice(0, MAX_NOTE_LENGTH) }),
      };
    }
  }
  const strengths = normalizeItems(record["strengths"]);
  const weaknesses = normalizeItems(record["weaknesses"]);
  if (strengths === null || weaknesses === null) return null;
  return { dimensions, strengths, weaknesses };
}

function normalizeItems(raw: unknown): readonly string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (trimmed === "") continue;
    if (!out.includes(trimmed.slice(0, MAX_NOTE_LENGTH))) out.push(trimmed.slice(0, MAX_NOTE_LENGTH));
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

// Deterministic, grounded fallback. Every dimension derives from an observed
// signal; a signal with no evidence leaves the dimension absent (so the
// overall score averages only what was actually observed).
export function buildFallbackEvaluation(input: EvaluationModelInput): EvaluationProposal {
  const candidateTurns = input.transcript.filter((m) => m.role === "candidate").length;
  const responseKinds = new Map<ResponseKind, number>();
  for (const response of input.responses) {
    responseKinds.set(response.kind, (responseKinds.get(response.kind) ?? 0) + 1);
  }
  const responseCount = input.responses.length;
  const latestRun = input.runs.length === 0 ? null : input.runs[input.runs.length - 1] ?? null;
  const hasCode = input.submissions.length > 0;

  const dimensions: Partial<Record<EvaluationDimension, DimensionScore>> = {
    // Engagement is observable regardless of correctness.
    problem_understanding: {
      score: clampScore(1 + Math.min(4, responseCount + Math.floor(candidateTurns / 2))),
    },
    communication: { score: clampScore(2 + Math.min(3, Math.floor(candidateTurns / 2))) },
    // Independence degrades with each hint (guided success is not solo success).
    independence: { score: clampScore(5 - input.hintsUsed) },
  };
  if ((responseKinds.get("approach") ?? 0) > 0) {
    dimensions.approach = { score: 4, notes: "Stated an approach." };
  } else if (responseCount > 0) {
    dimensions.approach = { score: 2, notes: "Limited approach signal." };
  }
  if (latestRun !== null && latestRun.totalCount > 0) {
    dimensions.coding = {
      score: clampScore((latestRun.passedCount / latestRun.totalCount) * 5),
      notes: `${latestRun.passedCount}/${latestRun.totalCount} cases passed.`,
    };
    dimensions.testing_debugging = {
      score: clampScore(latestRun.totalCount >= 3 ? 4 : 3),
      notes: `${latestRun.totalCount} case${latestRun.totalCount === 1 ? "" : "s"} exercised.`,
    };
  } else if (hasCode) {
    dimensions.coding = { score: 2, notes: "Code submitted but not executed." };
  }

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (responseCount > 0) strengths.push("Engaged with the problem and communicated reasoning.");
  if (latestRun !== null && latestRun.status === "passed") strengths.push("Solution passed the executed test cases.");
  if (input.hintsUsed === 0 && responseCount > 0) strengths.push("Worked without hints.");
  if (input.hintsUsed >= 3) weaknesses.push("Needed heavy hinting; practice independence.");
  if (latestRun !== null && latestRun.passedCount < latestRun.totalCount) {
    weaknesses.push("Some executed cases failed; revisit edge cases.");
  }
  if (responseCount === 0) weaknesses.push("No substantive responses were captured.");
  if (!hasCode) weaknesses.push("No implementation was submitted.");

  return { dimensions, strengths, weaknesses };
}
