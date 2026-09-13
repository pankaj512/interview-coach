// H-History (ux-spec §26): searchable, filterable, date-grouped past interviews.

import { useMemo, useState } from "react";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import type { HistoryEntry } from "../history.js";

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (difficulty !== "" && e.difficulty !== difficulty) return false;
      if (q === "") return true;
      return (e.interviewType ?? "Coding").toLowerCase().includes(q) || e.candidateId.toLowerCase().includes(q);
    });
  }, [entries, query, difficulty]);

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const entry of filtered) {
      const key = dayLabel(entry.at);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      <h1 className="page-title">Interview History</h1>
      <div className="history-controls">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search interviews…"
          aria-label="Search interviews"
        />
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Filter by difficulty">
          <option value="">All difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
          <option value="Mixed">Mixed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="empty-state">
          <p>{entries.length === 0 ? "No interviews yet." : "No interviews match your filters."}</p>
          <p className="hint">Your practice sessions on this browser will appear here.</p>
          <PrimaryButton onClick={onNew}>Start your first interview</PrimaryButton>
        </Card>
      ) : (
        groups.map(([label, items]) => (
          <section key={label} className="history-group">
            <h2 className="history-day">{label}</h2>
            <ul className="history-list">
              {items.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="history-row"
                    onClick={() => onSelect(entry)}
                    disabled={busyId !== null}
                  >
                    <span className="history-main">
                      <strong>{entry.interviewType ?? "Coding"}</strong>
                      <span className="hint">{entry.status.replace(/_/g, " ")}</span>
                    </span>
                    <span className="history-score">
                      {entry.overallScore === undefined ? "—" : `${entry.overallScore.toFixed(1)} / 10`}
                    </span>
                    <span className="history-meta">
                      {entry.difficulty !== undefined && <span className="badge">{entry.difficulty}</span>}
                      <span className="hint">{entry.durationMin === undefined ? "" : `${entry.durationMin} min`}</span>
                    </span>
                    <span className="history-action">{busyId === entry.id ? "loading…" : "Review →"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <div className="row actions">
        <GhostButton onClick={onBack}>Back</GhostButton>
        <PrimaryButton onClick={onNew}>Start new interview</PrimaryButton>
      </div>
    </>
  );
}
