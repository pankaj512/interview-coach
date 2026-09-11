// H-History — past interviews (ux-spec §1/§2: list → result detail).
//
// The browser keeps a lightweight local index (history.ts, cap 20); rows
// load canonical detail from the backend on selection. Empty list renders
// the empty-state + CTA to Setup.

import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import type { HistoryEntry } from "../history.js";

export function HistoryScreen({
  entries,
  busyId,
  onSelect,
  onNew,
  onBack,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly busyId: string | null;
  readonly onSelect: (entry: HistoryEntry) => void;
  readonly onNew: () => void;
  readonly onBack: () => void;
}) {
  return (
    <div className="screen screen-history">
      <header className="topbar topbar-post">
        <span className="brand">Interview Coach</span>
        <span className="spacer" />
        <GhostButton onClick={onBack}>Back</GhostButton>
      </header>
      <p className="eyebrow">History · Past interviews</p>
      <h2 className="screen-title">Past interviews</h2>
      {entries.length === 0 ? (
        <section className="card empty-state">
          <p>No interviews yet.</p>
          <p className="hint">Your interviews on this browser will appear here.</p>
          <div className="row actions">
            <PrimaryButton onClick={onNew} autoFocus>
              Start your first interview
            </PrimaryButton>
          </div>
        </section>
      ) : (
        <section className="card history-card">
          <ul className="history-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="history-row"
                  onClick={() => onSelect(entry)}
                  disabled={busyId !== null}
                  aria-label={`Open results for ${entry.candidateId}, ${entry.status}`}
                >
                  <span className="history-main">
                    <strong>{entry.candidateId}</strong>
                    <span className="hint-inline">{entry.id}</span>
                  </span>
                  <span className="history-meta">
                    <span className="badge">{entry.status.replace(/_/g, " ")}</span>
                    <span className="hint-inline">{busyId === entry.id ? "loading…" : new Date(entry.at).toLocaleString()}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="row actions">
            <PrimaryButton onClick={onNew}>Start new interview</PrimaryButton>
          </div>
        </section>
      )}
    </div>
  );
}
