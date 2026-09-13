// H-Feedback-Detail (ux-spec §24): per-dimension drill-in.

import { useState } from "react";
import type { SerializedEvaluation } from "../api/types.js";
import { GhostButton } from "../ds/buttons.js";
import { Card, Pill } from "../ds/primitives.js";
import { dimensionLabel } from "../dimensions.js";

function scoreOf(value: { readonly score: number; readonly notes?: string } | number): number {
  return typeof value === "number" ? value : value.score;
}

function notesOf(value: { readonly score: number; readonly notes?: string } | number): string | undefined {
  if (typeof value === "number") return undefined;
  return value.notes === undefined || value.notes === "" ? undefined : value.notes;
}

export function FeedbackDetailScreen({
  evaluation,
  onBack,
}: {
  readonly evaluation: SerializedEvaluation | null;
  readonly onBack: () => void;
}) {
  const keys = evaluation === null ? [] : Object.keys(evaluation.dimensions);
  const [selected, setSelected] = useState<string | null>(keys[0] ?? null);
  if (evaluation === null || keys.length === 0) {
    return (
      <Card>
        <h1 className="page-title">Feedback</h1>
        <p className="hint">No structured feedback yet.</p>
        <GhostButton onClick={onBack}>Back to Results</GhostButton>
      </Card>
    );
  }
  const active = selected ?? keys[0] ?? "";
  const value = evaluation.dimensions[active];
  const score = value === undefined ? 0 : scoreOf(value);
  const notes = value === undefined ? undefined : notesOf(value);

  return (
    <>
      <p className="eyebrow">Feedback detail</p>
      <h1 className="page-title">
        {dimensionLabel(active)} — {score} / 10
      </h1>
      <p className="lede">Feedback is specific and tied to actual interview moments.</p>

      <div className="pill-row">
        {keys.map((key) => (
          <Pill key={key} label={dimensionLabel(key)} selected={key === active} onClick={() => setSelected(key)} />
        ))}
      </div>

      {notes !== undefined && (
        <Card>
          <h3 className="section-title">Coach notes</h3>
          <p>{notes}</p>
        </Card>
      )}

      <div className="two-col">
        <Card>
          <h3 className="section-title accent-good">Strengths</h3>
          {evaluation.strengths.length === 0 ? <p className="hint">None recorded.</p> : (
            <ul className="check-list">
              {evaluation.strengths.map((s, i) => (
                <li key={i}>✓ {s}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h3 className="section-title accent-warn">Opportunities</h3>
          {evaluation.weaknesses.length === 0 ? <p className="hint">None recorded.</p> : (
            <ul className="check-list">
              {evaluation.weaknesses.map((w, i) => (
                <li key={i}>→ {w}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="section-title">Example improvement</h3>
        <p className="hint">
          {evaluation.weaknesses[0] !== undefined
            ? `Next time, focus on: ${evaluation.weaknesses[0]}`
            : "Keep practising this dimension with a focused session."}
        </p>
      </Card>

      <div className="row actions">
        <GhostButton onClick={onBack}>Back to Results</GhostButton>
      </div>
    </>
  );
}
