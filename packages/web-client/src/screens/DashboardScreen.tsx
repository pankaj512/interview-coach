// H-Dashboard (ux-spec §4): home with Start / Continue, performance summary,
// and recent interviews. Derived from the local history index.

import { Card, StatCard } from "../ds/primitives.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import type { HistoryEntry } from "../history.js";
import { buildProgress, overallBand } from "../progress.js";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function dimensionLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DashboardScreen({
  entries,
  onStart,
  onHistory,
  onOpen,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly onStart: () => void;
  readonly onHistory: () => void;
  readonly onOpen: (entry: HistoryEntry) => void;
}) {
  const progress = buildProgress(entries);
  const recent = entries.slice(0, 4);
  const last = entries[0];
  const topDimensions = progress.dimensions.slice(0, 3);
  const stats: readonly { label: string; value: string }[] = [
    { label: "Overall", value: progress.average === null ? "—" : progress.average.toFixed(1) },
    ...topDimensions.map((d) => ({ label: dimensionLabel(d.label), value: d.score.toFixed(1) })),
  ];

  return (
    <>
      <h1 className="page-title">{greeting()}</h1>
      <p className="lede">Ready for your next interview?</p>

      <div className="cta-row">
        <Card className="cta-card cta-primary">
          <h2 className="cta-title">Start Interview</h2>
          <p className="cta-sub">Choose type, difficulty, mode, and voice or text.</p>
          <PrimaryButton onClick={onStart}>Start interview</PrimaryButton>
        </Card>
        <Card className="cta-card">
          <h2 className="cta-title">Continue Practice</h2>
          <p className="cta-sub">
            {last === undefined
              ? "No sessions yet — your first practice will appear here."
              : `Last session: ${last.interviewType ?? "Coding"} · ${last.difficulty ?? "Medium"}`}
          </p>
          <GhostButton onClick={last === undefined ? onStart : () => onOpen(last)}>
            {last === undefined ? "Start your first interview" : "Open last session"}
          </GhostButton>
        </Card>
      </div>

      <h2 className="section-heading">Recent Performance</h2>
      <div className="stat-grid">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} {...(s.value === "—" ? {} : { unit: "/10" })} />
        ))}
      </div>

      <div className="section-head">
        <h2 className="section-heading">Recent Interviews</h2>
        <button type="button" className="link-button" onClick={onHistory}>
          View all
        </button>
      </div>
      {recent.length === 0 ? (
        <Card className="empty-state">
          <p>No interviews yet.</p>
          <p className="hint">Your practice sessions will appear here.</p>
        </Card>
      ) : (
        <Card className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Interview</th>
                <th>Difficulty</th>
                <th>Score</th>
                <th>Date</th>
                <th>Duration</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <button type="button" className="link-button" onClick={() => onOpen(entry)}>
                      {entry.interviewType ?? "Coding"}
                    </button>
                  </td>
                  <td>{entry.difficulty ?? "—"}</td>
                  <td className="strong">
                    {entry.overallScore === undefined ? "—" : `${entry.overallScore.toFixed(1)} / 10`}
                  </td>
                  <td className="muted">{new Date(entry.at).toLocaleDateString()}</td>
                  <td className="muted">{entry.durationMin === undefined ? "—" : `${entry.durationMin} min`}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => onOpen(entry)}>
                      Review →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="hint">
        Latest recorded band: {overallBand(progress.average)} · {progress.scoredCount} scored session
        {progress.scoredCount === 1 ? "" : "s"}.
      </p>
    </>
  );
}
