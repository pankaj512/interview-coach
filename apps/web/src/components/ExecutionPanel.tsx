// Code execution results on the debrief screen.
//
// Owns: the read-only view of backend-owned sandbox state (submission
// count plus latest run). Surprising: renders exactly what the server
// returns, so masked hidden cases can leak nothing more.
//
// History: HLD 6.4, S7b; see docs/SESSION_HANDOFF.md.

import { useEffect, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedRun } from "../api/types.js";
import { formatApiError } from "../state/use-interview.js";

export function ExecutionPanel({
  backend,
  interviewId,
}: {
  backend: BackendClient;
  interviewId: string;
}) {
  const [submissionCount, setSubmissionCount] = useState<number | null>(null);
  const [latest, setLatest] = useState<SerializedRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [submissions, runs] = await Promise.all([
          backend.listSubmissions(interviewId),
          backend.listRuns(interviewId),
        ]);
        if (cancelled) return;
        setSubmissionCount(submissions.length);
        setLatest(runs.length === 0 ? null : (runs[runs.length - 1] ?? null));
      } catch (e) {
        if (!cancelled) setError(formatApiError(e));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [backend, interviewId]);

  return (
    <section className="card" aria-label="Code execution">
      <h3>
        <span aria-hidden="true">▣</span> Code execution
      </h3>
      {error !== null && <p className="error">{error}</p>}
      {error === null && submissionCount === null && (
        <p className="hint">Loading execution history...</p>
      )}
      {error === null && submissionCount !== null && submissionCount === 0 && (
        <p className="hint">No code submitted this interview.</p>
      )}
      {error === null && submissionCount !== null && submissionCount > 0 && (
        <>
          <p className="hint-inline">
            {submissionCount} submission{submissionCount === 1 ? "" : "s"}
            {latest !== null &&
              ` · latest run ${latest.status} ${latest.passedCount}/${latest.totalCount} in ${latest.durationMs}ms`}
            {latest === null && " · not run yet"}
          </p>
          {latest !== null && latest.results.length > 0 && (
            <ul className="event-log">
              {latest.results.map((result) => (
                <li key={result.name}>
                  <span className="event-kind">{result.passed ? "pass" : "fail"}</span>{" "}
                  {result.name}
                  {result.hidden && " (hidden)"}
                  {result.error !== undefined && result.error !== "" && ` - ${result.error}`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
