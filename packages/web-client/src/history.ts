// Interview history view model (H-History / Dashboard / Progress).
//
// Phase 9: history is server-owned. The browser no longer keeps a local
// index (localStorage authority retired); the screens render a derived view
// model built from `GET /api/interviews` summaries. Detail views still
// re-fetch canonical state from the backend.

import type { EvaluationStatus, InterviewStatus, SerializedEvaluation, SerializedInterviewSummary } from "./api/types.js";
import type { BackendClient } from "./api/backend-client.js";

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

/** Hard-delete every interview page by page (history lists are capped, so
 *  one page is rarely all of it). Deletes everything deletable: entries that
 *  fail are skipped on later pages so one stuck row cannot block the rest or
 *  loop forever. Never throws for delete failures; a list failure rejects. */
export async function deleteAllInterviews(
  client: Pick<BackendClient, "listInterviews" | "deleteInterview" | "cancelInterview">,
  limit: number,
): Promise<{ deleted: number; failed: boolean }> {
  let deleted = 0;
  const skipped = new Set<string>();
  for (;;) {
    const page = (await client.listInterviews(limit)).filter((s) => !skipped.has(s.interview.id));
    if (page.length === 0) return { deleted, failed: skipped.size > 0 };
    for (const summary of page) {
      try {
        await deleteHistoryEntry(client, summary.interview.id, summary.interview.status);
        deleted += 1;
      } catch {
        skipped.add(summary.interview.id);
      }
    }
  }
}

/** Delete one interview, cancelling it first when it is still live. The
 *  domain guard refuses `in_progress`/`paused` rows, and no screen offers a
 *  standalone cancel, so Delete on a live row means cancel-then-delete. */
export async function deleteHistoryEntry(
  client: Pick<BackendClient, "deleteInterview" | "cancelInterview">,
  id: string,
  status: InterviewStatus,
): Promise<void> {
  if (status === "in_progress" || status === "paused") {
    await client.cancelInterview(id, "Deleted from history");
  }
  await client.deleteInterview(id);
}
