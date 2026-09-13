// H-Results (ux-spec §22–§24): debrief with score hero, category scores,
// strengths / improvements, and the review / practice actions.

import type { BackendClient } from "../api/backend-client.js";
import type { SerializedEvaluation, SerializedStateSnapshot } from "../api/types.js";
import { EvaluationForm } from "../components/EvaluationForm.js";
import { ExecutionPanel } from "../components/ExecutionPanel.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, ScoreRow } from "../ds/primitives.js";
import { dimensionLabel } from "../dimensions.js";
import { overallBand } from "../progress.js";
import type { LiveEvent } from "../state/use-interview.js";

function toTen(score: number): number {
  return score > 10 ? Math.round((score / 10) * 10) / 10 : Math.round(score * 10) / 10;
}

function dimensionScore(value: { readonly score: number; readonly notes?: string } | number): number {
  return typeof value === "number" ? value : value.score;
}

function dimensionNotes(value: { readonly score: number; readonly notes?: string } | number): string | undefined {
  if (typeof value === "number") return undefined;
  return value.notes === undefined || value.notes === "" ? undefined : value.notes;
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
  if (snapshot === null) {
    return (
      <Card>
        <h1 className="page-title">Results</h1>
        <p className="hint">Final state is loading…</p>
      </Card>
    );
  }

  const evaluation: SerializedEvaluation | null = snapshot.evaluation;
  const overall = evaluation?.overallScore === undefined ? null : toTen(evaluation.overallScore);
  const dimensions = evaluation === null ? [] : Object.entries(evaluation.dimensions);

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
          </p>
        </div>
      </Card>

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
      ) : (
        <Card>
          <p className="hint">No structured evaluation yet — complete the coach review below.</p>
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

      {evaluation === null && (
        <EvaluationForm backend={backend} interviewId={snapshot.interview.id} onEvaluated={() => undefined} />
      )}

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
