// Interview history view model (H-History / Dashboard / Progress).
//
// Phase 9: history is server-owned. The browser no longer keeps a local
// index (localStorage authority retired); the screens render a derived view
// model built from `GET /api/interviews` summaries. Detail views still
// re-fetch canonical state from the backend.

import type { EvaluationStatus, InterviewStatus, SerializedEvaluation, SerializedInterviewSummary } from "./api/types.js";

export interface HistoryEntry {
  readonly id: string;
  readonly candidateId: string;
  readonly status: InterviewStatus;
  readonly evaluationStatus: EvaluationStatus;
  readonly at: string;
  /** Presentation metadata derived from the server summary. */
  readonly interviewType?: string;
  readonly difficulty?: string;
  readonly mode?: string;
  readonly durationMin?: number;
  readonly overallScore?: number;
  readonly recommendation?: string;
  readonly hintsUsed?: number;
  readonly strengths?: readonly string[];
  readonly weaknesses?: readonly string[];
  readonly dimensions?: Readonly<Record<string, number>>;
}

function dimensionsOf(evaluation: SerializedEvaluation | null): Readonly<Record<string, number>> | undefined {
  if (evaluation === null) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(evaluation.dimensions)) {
    const score = typeof value === "number" ? value : value.score;
    if (typeof score === "number" && Number.isFinite(score)) out[key] = score;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function historyEntryFromSummary(summary: SerializedInterviewSummary): HistoryEntry {
  const { interview, evaluation } = summary;
  const durationMin =
    interview.startedAt !== undefined && interview.endedAt !== undefined
      ? Math.max(
          1,
          Math.round(
            (Date.parse(interview.endedAt) - Date.parse(interview.startedAt)) / 60_000,
          ),
        )
      : interview.configuration.durationMinutes;
  const dimensions = dimensionsOf(evaluation);
  return {
    id: interview.id,
    candidateId: interview.candidateId,
    status: interview.status,
    evaluationStatus: interview.evaluationStatus,
    at: interview.endedAt ?? interview.updatedAt,
    interviewType: interview.configuration.interviewType === "dsa" ? "Coding" : interview.configuration.interviewType,
    ...(interview.configuration.difficulty === undefined
      ? {}
      : { difficulty: interview.configuration.difficulty }),
    ...(durationMin === undefined ? {} : { durationMin }),
    ...(evaluation?.overallScore === undefined ? {} : { overallScore: evaluation.overallScore }),
    ...(evaluation?.recommendation === undefined
      ? {}
      : { recommendation: evaluation.recommendation }),
    ...(evaluation === null ? {} : { hintsUsed: evaluation.hintsUsed }),
    ...(evaluation === null || evaluation.strengths.length === 0
      ? {}
      : { strengths: evaluation.strengths }),
    ...(evaluation === null || evaluation.weaknesses.length === 0
      ? {}
      : { weaknesses: evaluation.weaknesses }),
    ...(dimensions === undefined ? {} : { dimensions }),
  };
}

export function historyEntriesFromSummaries(
  summaries: readonly SerializedInterviewSummary[],
): readonly HistoryEntry[] {
  return summaries.map(historyEntryFromSummary);
}
