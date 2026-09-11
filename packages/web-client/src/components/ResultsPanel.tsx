// HLD 4.5 — results display (S4).
//
// Read-only view of the backend's evaluation snapshot. Scores live in the
// backend; the client renders whatever the server persisted (or an explicit
// "not yet evaluated" state — never invented).

import type { SerializedStateSnapshot } from "../api/types.js";

export function ResultsPanel({ snapshot }: { snapshot: SerializedStateSnapshot | null }) {
  if (snapshot === null) {
    return (
      <section className="card">
        <h3>Results</h3>
        <p className="hint">Final state is loading…</p>
      </section>
    );
  }
  const evaluation = snapshot.evaluation;
  return (
    <section className="card">
      <h3>Results</h3>
      <dl className="results">
        <div>
          <dt>Status</dt>
          <dd>{snapshot.interview.status}</dd>
        </div>
        <div>
          <dt>Responses</dt>
          <dd>{snapshot.responseCount}</dd>
        </div>
        {evaluation !== null ? (
          <>
            {evaluation.overallScore !== undefined && (
              <div>
                <dt>Overall score</dt>
                <dd>{evaluation.overallScore}</dd>
              </div>
            )}
            <div>
              <dt>Hints used</dt>
              <dd>{evaluation.hintsUsed}</dd>
            </div>
            {evaluation.recommendation !== undefined && (
              <div>
                <dt>Recommendation</dt>
                <dd>{evaluation.recommendation}</dd>
              </div>
            )}
            {evaluation.strengths.length > 0 && (
              <div>
                <dt>Strengths</dt>
                <dd>{evaluation.strengths.join("; ")}</dd>
              </div>
            )}
            {evaluation.weaknesses.length > 0 && (
              <div>
                <dt>Weaknesses</dt>
                <dd>{evaluation.weaknesses.join("; ")}</dd>
              </div>
            )}
            {Object.keys(evaluation.dimensions).length > 0 && (
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {Object.entries(evaluation.dimensions)
                    .map(([name, score]) => `${name}: ${score}`)
                    .join(" · ")}
                </dd>
              </div>
            )}
          </>
        ) : (
          <p className="hint">No structured evaluation yet — conversational feedback stands. (Evaluation pipeline: Phase 5.)</p>
        )}
      </dl>
    </section>
  );
}
