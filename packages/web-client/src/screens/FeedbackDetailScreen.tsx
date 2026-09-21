// H-Feedback-Detail (ux-spec §24): per-dimension drill-in. The selected
// dimension is controlled by the parent so Results rows land directly on the
// dimension that was clicked.

import type { SerializedEvaluation } from "../api/types.js";
import { GhostButton } from "../ds/buttons.js";
import { Card, Pill } from "../ds/primitives.js";
import { dimensionLabel } from "../dimensions.js";

export function FeedbackDetailScreen({
  evaluation,
  selected,
  onSelect,
  onBack,
}: {
  readonly evaluation: SerializedEvaluation | null;
  readonly selected: string | null;
  readonly onSelect: (dimensionKey: string) => void;
  readonly onBack: () => void;
}) {
  const keys = evaluation === null ? [] : Object.keys(evaluation.dimensions);
  if (evaluation === null || keys.length === 0) {
    return (
      <Card>
        <h1 className="page-title">Feedback</h1>
        <p className="hint">No structured feedback yet.</p>
        <GhostButton onClick={onBack}>Back to Results</GhostButton>
      </Card>
    );
  }
  const first = keys[0] ?? "";
  const active = selected !== null && evaluation.dimensions[selected] !== undefined ? selected : first;
  const value = evaluation.dimensions[active];
  const score = value?.score ?? 0;
  const notes = value?.notes === undefined || value?.notes === "" ? undefined : value.notes;
  const overall = evaluation.overallScore;

  return (
    <>
      <p className="eyebrow">Feedback detail</p>
      <h1 className="page-title">
        {dimensionLabel(active)} — {score} / 5{overall !== undefined && ` (overall ${overall} / 100)`}
      </h1>
      <p className="lede">Feedback is specific and tied to actual interview moments.</p>

      <div className="pill-row">
        {keys.map((key) => (
          <Pill key={key} label={dimensionLabel(key)} selected={key === active} onClick={() => onSelect(key)} />
        ))}
      </div>

      <Card>
        <h3 className="section-title">Coach notes</h3>
        {notes === undefined ? <p className="hint">No coach notes for this dimension.</p> : <p>{notes}</p>}
      </Card>

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
