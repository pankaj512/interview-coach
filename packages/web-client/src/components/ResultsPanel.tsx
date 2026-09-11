// HLD 4.5 — results display (S4, S5b evaluation pipeline).
//
// Read-only view of the backend's evaluation snapshot plus the S5b
// finalize form when no structured evaluation exists yet. Scores live in
// the backend; the client renders whatever the server persisted (or an
// explicit "not yet evaluated" state — never invented). Dimensions render
// per-key so the panel needs no update whatever dimension set the backend
// returns. Suggested focus derives from persisted weaknesses + the
// interview's topic focus (backend state, not model output).

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedEvaluation, SerializedStateSnapshot } from "../api/types.js";
import { EvaluationForm } from "./EvaluationForm.js";

function formatDimension(value: { score: number; notes?: string } | number): string {
  if (typeof value === "number") return String(value);
  return value.notes !== undefined && value.notes !== "" ? `${value.score} (${value.notes})` : String(value.score);
}

function suggestedFocus(snapshot: SerializedStateSnapshot): string | null {
  const evaluation = snapshot.evaluation;
  const topics = snapshot.interview.configuration.topicFocus ?? [];
  if (evaluation !== null && evaluation.weaknesses.length > 0) {
    const base = evaluation.weaknesses.join("; ");
    return topics.length > 0 ? `${base} — revisit ${topics.join(", ")}` : base;
  }
  if (topics.length > 0) return `Continue ${topics.join(", ")}`;
  return null;
}

export function ResultsPanel({
  backend,
  snapshot,
}: {
  backend: BackendClient;
  snapshot: SerializedStateSnapshot | null;
}) {
  const [evaluation, setEvaluation] = useState<SerializedEvaluation | null>(null);
  if (snapshot === null) {
    return (
      <section className="card">
        <h3>Results</h3>
        <p className="hint">Final state is loading…</p>
      </section>
    );
  }
  const shown = evaluation !== null && evaluation.interviewId === snapshot.interview.id
    ? evaluation
    : snapshot.evaluation;
  const focus = suggestedFocus({ ...snapshot, evaluation: shown });
  return (
    <>
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
          <div>
            <dt>Hints used</dt>
            <dd>{shown?.hintsUsed ?? 0}</dd>
          </div>
          {shown !== null ? (
            <>
              {shown.overallScore !== undefined && (
                <div>
                  <dt>Overall score</dt>
                  <dd>{shown.overallScore}</dd>
                </div>
              )}
              {shown.recommendation !== undefined && (
                <div>
                  <dt>Recommendation</dt>
                  <dd>{shown.recommendation}</dd>
                </div>
              )}
              {shown.strengths.length > 0 && (
                <div>
                  <dt>Strengths</dt>
                  <dd>{shown.strengths.join("; ")}</dd>
                </div>
              )}
              {shown.weaknesses.length > 0 && (
                <div>
                  <dt>Weaknesses</dt>
                  <dd>{shown.weaknesses.join("; ")}</dd>
                </div>
              )}
              {Object.keys(shown.dimensions).length > 0 && (
                <div>
                  <dt>Dimensions</dt>
                  <dd>
                    {Object.entries(shown.dimensions)
                      .map(([name, score]) => `${name}: ${formatDimension(score)}`)
                      .join(" · ")}
                  </dd>
                </div>
              )}
              {focus !== null && (
                <div>
                  <dt>Suggested focus</dt>
                  <dd>{focus}</dd>
                </div>
              )}
            </>
          ) : (
            <p className="hint">No structured evaluation yet — finalize one below.</p>
          )}
        </dl>
      </section>
      {shown === null && (
        <EvaluationForm
          backend={backend}
          interviewId={snapshot.interview.id}
          onEvaluated={setEvaluation}
        />
      )}
    </>
  );
}
