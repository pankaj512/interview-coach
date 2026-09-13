// H-Progress (ux-spec §27–§28): trend + areas to improve, derived from history.

import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, ScoreRow } from "../ds/primitives.js";
import type { HistoryEntry } from "../history.js";
import { buildProgress } from "../progress.js";

function TrendChart({ scores }: { readonly scores: readonly number[] }) {
  if (scores.length === 0) {
    return <p className="hint">Complete a few interviews to see your performance trend.</p>;
  }
  const w = 640, h = 220, pad = 28;
  const xFor = (i: number) => (scores.length === 1 ? w / 2 : pad + (i / (scores.length - 1)) * (w - pad * 2));
  const yFor = (s: number) => h - pad - (Math.min(10, Math.max(0, s)) / 10) * (h - pad * 2);
  const points = scores.map((s, i) => `${xFor(i).toFixed(1)},${yFor(s).toFixed(1)}`).join(" ");
  return (
    <svg className="trend-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Overall performance trend">
      {[0, 2, 4, 6, 8, 10].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={yFor(g)} y2={yFor(g)} className="trend-grid" />
      ))}
      <polyline points={points} className="trend-line" />
      {scores.map((s, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(s)} r={4} className="trend-dot" />
      ))}
    </svg>
  );
}

export function ProgressScreen({
  entries,
  onWeakAreas,
  onNew,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly onWeakAreas: () => void;
  readonly onNew: () => void;
}) {
  const progress = buildProgress(entries);
  const areas = progress.dimensions.slice().sort((a, b) => a.score - b.score);

  return (
    <>
      <h1 className="page-title">Progress</h1>
      <p className="lede">Am I actually getting better? Progress, not gamification.</p>

      <div className="progress-grid">
        <Card>
          <h3 className="section-title">Overall performance</h3>
          <TrendChart scores={progress.trend.map((t) => t.score)} />
        </Card>
        <Card>
          <h3 className="section-title">Areas to improve</h3>
          {areas.length === 0 ? (
            <p className="hint">No dimension scores yet. Finish an interview to populate this.</p>
          ) : (
            areas.slice(0, 4).map((a) => (
              <ScoreRow key={a.label} label={a.label.replace(/_/g, " ")} score={a.score} />
            ))
          )}
          <div className="row actions">
            <PrimaryButton onClick={onWeakAreas}>Practice weak areas</PrimaryButton>
          </div>
        </Card>
      </div>

      {progress.weaknesses.length > 0 && (
        <Card>
          <h3 className="section-title">Recurring weaknesses</h3>
          <ul className="plain-list">
            {progress.weaknesses.slice(0, 6).map((w) => (
              <li key={w.label}>
                {w.label} <span className="hint">· {w.count}×</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="row actions">
        <GhostButton onClick={onNew}>Start new interview</GhostButton>
      </div>
    </>
  );
}
