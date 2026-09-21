// H-Results (ux-spec §22): debrief with score hero, dimension rows with
// evidence, strengths / improvements, and the review / practice actions.
//
// Phase 10: the evaluation is produced asynchronously by the backend when the
// interview ends. This screen polls `GET /api/interviews/:id/evaluation` while
// the interview's evaluationStatus is pending and shows "Evaluation in
// progress" until a validated result (or a failure) arrives. Scores render in
// canonical units: overall x/100, dimensions x/5 (ux-spec §23).

import { useEffect, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedEvaluation, SerializedStateSnapshot } from "../api/types.js";
import { ExecutionPanel } from "../components/ExecutionPanel.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import { dimensionLabel } from "../dimensions.js";
import { formatRecommendation, overallBand } from "../progress.js";

function hasDimensions(evaluation: SerializedEvaluation | null): boolean {
  return evaluation !== null && Object.keys(evaluation.dimensions).length > 0;
}

export function ResultsScreen({
  backend,
  snapshot,
  stale = false,
  onHistory,
  onNew,
  onTranscript,
  onWeakAreas,
  onFeedback,
}: {
  readonly backend: BackendClient;
  readonly snapshot: SerializedStateSnapshot | null;
  readonly stale?: boolean;
  readonly onHistory: () => void;
  readonly onNew: () => void;
  readonly onTranscript: () => void;
  readonly onWeakAreas: () => void;
  readonly onFeedback: (dimensionKey: string) => void;
}) {
  const [evaluation, setEvaluation] = useState<SerializedEvaluation | null>(
    snapshot?.evaluation ?? null,
  );
  const [evalStatus, setEvalStatus] = useState<string>(
    snapshot?.interview.evaluationStatus ?? "none",
  );
  const interviewId = snapshot?.interview.id;

  // Poll the async evaluation until a real result or a failure arrives.
  useEffect(() => {
    if (interviewId === undefined) return;
    const initial = snapshot?.evaluation ?? null;
    if (hasDimensions(initial)) return;
    let cancelled = false;
    let timer: number | null = null;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const next = await backend.getEvaluation(interviewId);
        if (cancelled) return;
        if (next !== null) {
          setEvaluation(next);
          setEvalStatus(next.status);
          if (hasDimensions(next) || next.status === "failed") return;
        }
      } catch {
        // Transient: keep polling until the attempt budget runs out.
      }
      if (!cancelled && attempts < 20) {
        timer = window.setTimeout(() => void poll(), 1500);
      }
    };
    timer = window.setTimeout(() => void poll(), 1200);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, interviewId]);

  if (snapshot === null) {
    return (
      <Card>
        <h1 className="page-title">Results</h1>
        <p className="hint">Final state is loading…</p>
      </Card>
    );
  }

  const scored = hasDimensions(evaluation);
  const overall = evaluation?.overallScore ?? null;
  const dimensions = evaluation === null ? [] : Object.entries(evaluation.dimensions);
  const inProgress = !scored && evalStatus !== "failed";
  const interviewType =
    snapshot.interview.configuration.interviewType === "dsa"
      ? "Coding"
      : snapshot.interview.configuration.interviewType;
  const problemTitle = snapshot.currentProblem?.title ?? null;

  return (
    <>
      <p className="page-meta">
        Interview Results · {interviewType}
        {snapshot.interview.configuration.difficulty !== undefined &&
          ` · ${snapshot.interview.configuration.difficulty}`}
        {` · ${snapshot.responseCount} responses`}
      </p>
      <h1 className="page-title">
        {problemTitle === null ? "Interview results" : `${problemTitle}, reviewed`}
      </h1>
      {stale && (
        <Card className="state-card state-reconnecting" role="note">
          <p>Saved history entry — live state unavailable. Scores below may be stale.</p>
        </Card>
      )}

      {inProgress ? (
        <Card className="hero-card" role="status">
          <div className="hero-score">
            <span className="hero-number">◌</span>
          </div>
          <div className="hero-meta">
            <span className="band-chip">Evaluation in progress</span>
            <p className="hint">
              Your interview is saved. The coach is reviewing the transcript, code, and approach —
              this usually takes a few seconds.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="hero-card">
          <div className="hero-score">
            <span className="hero-number">{overall === null ? "—" : overall}</span>
            <span className="hero-den">/ 100</span>
          </div>
          <div className="hero-meta">
            <span className="band-chip">● {overallBand(overall)}</span>
            <p className="hero-rec">
              Recommendation: <strong>{formatRecommendation(evaluation?.recommendation)}</strong>
            </p>
            <p className="hint">
              Hints used: {evaluation?.hintsUsed ?? 0} · Responses: {snapshot.responseCount}
              {evaluation?.source === "fallback" && " · heuristic review"}
            </p>
          </div>
        </Card>
      )}

      <h2 className="section-title">Dimension scores</h2>
      {dimensions.length > 0 ? (
        <div className="dim-list">
          {dimensions.map(([key, value]) => (
            <button
              key={key}
              type="button"
              className="card dim-row"
              onClick={() => onFeedback(key)}
              aria-label={`${dimensionLabel(key)}, ${value.score} out of 5, show feedback`}
            >
              <div className="dim-top">
                <code className="dim-name">{key}</code>
                <span className="dim-val">{value.score} / 5</span>
              </div>
              <div className="dim-track" aria-hidden="true">
                <div
                  className={value.score < 3 ? "dim-fill low" : "dim-fill"}
                  style={{ width: `${Math.min(100, Math.max(0, (value.score / 5) * 100))}%` }}
                />
              </div>
              {value.notes !== undefined && value.notes !== "" && (
                <p className="dim-ev">{value.notes}</p>
              )}
            </button>
          ))}
        </div>
      ) : evalStatus === "failed" ? (
        <Card>
          <p className="hint">
            The evaluation could not be completed. Your interview and transcript are saved — you can
            review it from History and try again later.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="hint">Dimension scores will appear here as soon as the review completes.</p>
        </Card>
      )}

      {evaluation !== null && (evaluation.strengths.length > 0 || evaluation.weaknesses.length > 0) && (
        <div className="two-col">
          <Card>
            <h3 className="section-title accent-good">What went well</h3>
            <ul className="check-list">
              {evaluation.strengths.map((s, i) => (
                <li key={i}>✓ {s}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="section-title accent-warn">Improve next</h3>
            <ul className="check-list">
              {evaluation.weaknesses.map((w, i) => (
                <li key={i}>→ {w}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <ExecutionPanel backend={backend} interviewId={snapshot.interview.id} />

      <div className="row actions">
        <GhostButton onClick={onTranscript}>Review interview</GhostButton>
        <PrimaryButton onClick={onWeakAreas}>Practice weak areas</PrimaryButton>
        <GhostButton onClick={onHistory}>Back to History</GhostButton>
        <GhostButton onClick={onNew}>Start new interview</GhostButton>
      </div>
    </>
  );
}
