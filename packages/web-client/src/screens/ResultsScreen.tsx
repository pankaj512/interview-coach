// H-Results (ux-spec §22–§24): debrief with score hero, category scores,
// strengths / improvements, and the review / practice actions.
//
// Phase 10: the evaluation is produced asynchronously by the backend when the
// interview ends. This screen polls `GET /api/interviews/:id/evaluation` while
// the interview's evaluationStatus is pending and shows "Evaluation in
// progress" until a validated result (or a failure) arrives. The manual
// evaluation form is retired.

import { useEffect, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedEvaluation, SerializedStateSnapshot } from "../api/types.js";
import { ExecutionPanel } from "../components/ExecutionPanel.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, ScoreRow } from "../ds/primitives.js";
import { dimensionLabel } from "../dimensions.js";
import { overallBand } from "../progress.js";
import type { LiveEvent } from "../state/use-interview.js";

function toTen(score: number): number {
  return score > 10 ? Math.round((score / 10) * 10) / 10 : Math.round(score * 10) / 10;
}

function dimensionScore(value: { readonly score: number; readonly notes?: string }): number {
  return value.score;
}

function dimensionNotes(value: { readonly score: number; readonly notes?: string }): string | undefined {
  return value.notes === undefined || value.notes === "" ? undefined : value.notes;
}

function hasDimensions(evaluation: SerializedEvaluation | null): boolean {
  return evaluation !== null && Object.keys(evaluation.dimensions).length > 0;
}

export function ResultsScreen({
  backend,
  snapshot,
  events,
  stale = false,
  onHistory,
  onNew,
  onTranscript,
  onWeakAreas,
  onFeedback,
}: {
  readonly backend: BackendClient;
  readonly snapshot: SerializedStateSnapshot | null;
  readonly events: readonly LiveEvent[];
  readonly stale?: boolean;
  readonly onHistory: () => void;
  readonly onNew: () => void;
  readonly onTranscript: () => void;
  readonly onWeakAreas: () => void;
  readonly onFeedback: () => void;
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
  const overall = evaluation?.overallScore === undefined ? null : toTen(evaluation.overallScore);
  const dimensions = evaluation === null ? [] : Object.entries(evaluation.dimensions);
  const inProgress = !scored && evalStatus !== "failed";

  return (
    <>
      <p className="eyebrow">
        Debrief · {snapshot.interview.configuration.interviewType === "dsa" ? "Coding" : snapshot.interview.configuration.interviewType} ·{" "}
        {snapshot.interview.configuration.difficulty ?? "Medium"} · {snapshot.responseCount} responses
      </p>
      <h1 className="page-title">Results — {snapshot.interview.candidateId}</h1>
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
            <span className="hero-number">{overall === null ? "—" : overall.toFixed(1)}</span>
            <span className="hero-den">/ 10</span>
          </div>
          <div className="hero-meta">
            <span className="band-chip">● {overallBand(overall)}</span>
            <p className="hero-rec">
              Recommendation: <strong>{(evaluation?.recommendation ?? "—").replace(/_/g, " ")}</strong>
            </p>
            <p className="hint">
              Hints used: {evaluation?.hintsUsed ?? 0} · Responses: {snapshot.responseCount}
              {evaluation?.source === "fallback" && " · heuristic review"}
            </p>
          </div>
        </Card>
      )}

      <h2 className="section-heading">Dimension scores</h2>
      {dimensions.length > 0 ? (
        <div className="dimension-grid">
          {dimensions.map(([key, raw]) => (
            <button key={key} type="button" className="card dimension-card" onClick={onFeedback}>
              <ScoreRow label={dimensionLabel(key)} score={toTen(dimensionScore(raw))} />
              {dimensionNotes(raw) !== undefined && <p className="hint">{dimensionNotes(raw)}</p>}
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
        <GhostButton onClick={onWeakAreas}>Practice weak areas</GhostButton>
        <GhostButton onClick={onHistory}>Back to History</GhostButton>
        <PrimaryButton onClick={onNew}>Start new interview</PrimaryButton>
      </div>
      <p className="hint">{events.length} session events captured.</p>
    </>
  );
}
