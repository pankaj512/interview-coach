// @interview-coach/core - AI-only Submit verdict contract (feature 18d).
//
// The backend assembles the input (problem context + candidate code), a
// server-side LLM proposes a structured verdict, and the backend validates
// it. There is no deterministic fallback: a missing or invalid proposal is
// surfaced as an error, never an invented verdict. Nothing is persisted.

import {
  CODE_LANGUAGES,
  MAX_SUBMISSION_CHARS,
  type CodeLanguage,
} from "./submission.js";

export type VerdictCorrectness = "correct" | "incorrect" | "uncertain";

const CORRECTNESS_VALUES: readonly string[] = ["correct", "incorrect", "uncertain"];

export interface SubmitVerdictProblem {
  readonly id: string;
  readonly title: string;
  readonly statement: string;
  readonly constraints: string;
}

export interface SubmitVerdictInput {
  readonly interviewId: string;
  readonly language: CodeLanguage;
  readonly code: string;
  readonly problem: SubmitVerdictProblem | null;
}

export interface SubmitVerdict {
  readonly correctness: VerdictCorrectness;
  readonly correctnessNotes: string;
  readonly optimality: string;
  readonly optimalityNotes: string;
  readonly breakPoints: readonly string[];
  readonly edgeCases: readonly string[];
  readonly summary: string;
}

export interface SubmitVerdictModelResult {
  readonly proposal: SubmitVerdict | null;
  readonly error?: string;
}

// The model/app boundary: input in, validated proposal or error out.
export interface SubmitVerdictModel {
  readonly name: string;
  judge(input: SubmitVerdictInput): Promise<SubmitVerdictModelResult>;
}

const MAX_NOTE_LENGTH = 400;
const MAX_ITEMS = 12;

function normalizeText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.trim().slice(0, MAX_NOTE_LENGTH);
}

function normalizeItems(raw: unknown): readonly string[] | null {
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

// Validates an untrusted verdict proposal. Returns null when it cannot be
// used, so the caller surfaces an error instead of an invented verdict.
export function validateSubmitVerdictProposal(raw: unknown): SubmitVerdict | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const correctness = record["correctness"];
  if (typeof correctness !== "string" || !CORRECTNESS_VALUES.includes(correctness)) return null;
  const correctnessNotes = normalizeText(record["correctnessNotes"]);
  const optimality = normalizeText(record["optimality"]);
  const optimalityNotes = normalizeText(record["optimalityNotes"]);
  const summary = normalizeText(record["summary"]);
  if (correctnessNotes === null || optimality === null || optimalityNotes === null || summary === null) {
    return null;
  }
  if (summary === "") return null;
  const breakPoints = normalizeItems(record["breakPoints"]);
  const edgeCases = normalizeItems(record["edgeCases"]);
  if (breakPoints === null || edgeCases === null) return null;
  return {
    correctness: correctness as VerdictCorrectness,
    correctnessNotes,
    optimality,
    optimalityNotes,
    breakPoints,
    edgeCases,
    summary,
  };
}

// Validates the judge input: known language, non-empty code within the same
// cap as persisted submissions, and a well-shaped (or null) problem.
export function validateSubmitVerdictInput(raw: unknown): SubmitVerdictInput | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const interviewId = record["interviewId"];
  if (typeof interviewId !== "string" || interviewId.trim() === "") return null;
  const language = record["language"];
  if (typeof language !== "string" || !(CODE_LANGUAGES as readonly string[]).includes(language)) {
    return null;
  }
  const code = record["code"];
  if (typeof code !== "string" || code.trim() === "" || code.length > MAX_SUBMISSION_CHARS) return null;
  const problem = record["problem"];
  if (problem !== null && problem !== undefined) {
    if (typeof problem !== "object" || Array.isArray(problem)) return null;
    const entry = problem as Record<string, unknown>;
    for (const key of ["id", "title", "statement", "constraints"] as const) {
      if (typeof entry[key] !== "string" || (entry[key] as string).trim() === "") return null;
    }
  }
  const entry = (problem ?? null) as Record<string, unknown> | null;
  return {
    interviewId: interviewId.trim(),
    language: language as CodeLanguage,
    code,
    problem:
      entry === null
        ? null
        : {
            id: (entry["id"] as string).trim(),
            title: (entry["title"] as string).trim(),
            statement: (entry["statement"] as string).trim(),
            constraints: (entry["constraints"] as string).trim(),
          },
  };
}
