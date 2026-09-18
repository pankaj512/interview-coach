// H-History (ux-spec §26): searchable, filterable, date-grouped past interviews.

import { useMemo, useState } from "react";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, ChipList, Pill, SectionHead } from "../ds/primitives.js";
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
  deletingId,
  loading,
  hasMore,
  onSelect,
  onDelete,
  onLoadMore,
  onNew,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly busyId: string | null;
  readonly deletingId: string | null;
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly onSelect: (entry: HistoryEntry) => void;
  readonly onDelete: (entry: HistoryEntry) => void;
  readonly onLoadMore: () => void;
  readonly onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [quick, setQuick] = useState<"all" | "evaluated" | "pending" | "failed">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (difficulty !== "" && e.difficulty !== difficulty) return false;
      if (quick === "evaluated" && e.evaluationStatus !== "completed") return false;
      if (quick === "pending" && e.evaluationStatus !== "pending") return false;
      if (quick === "failed" && e.evaluationStatus !== "failed") return false;
      if (q === "") return true;
      return (e.interviewType ?? "Coding").toLowerCase().includes(q) || e.candidateId.toLowerCase().includes(q);
    });
  }, [entries, query, difficulty, quick]);

  const evaluationLabel = (status: string): string => {
    if (status === "completed") return "evaluated";
    if (status === "pending") return "evaluation pending";
    if (status === "failed") return "evaluation failed";
    return "not evaluated";
  };

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
      <SectionHead title="Interview History" meta={filtered.length === 1 ? "1 session" : `${filtered.length} sessions`} />
      <ChipList label="Quick filters">
        <Pill label="All" selected={quick === "all"} onClick={() => setQuick("all")} />
        <Pill label="Evaluated" selected={quick === "evaluated"} onClick={() => setQuick("evaluated")} />
        <Pill label="Pending" selected={quick === "pending"} onClick={() => setQuick("pending")} />
        <Pill label="Failed" selected={quick === "failed"} onClick={() => setQuick("failed")} />
      </ChipList>
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
          <p className="hint">Your server-backed practice history will appear here.</p>
          <PrimaryButton onClick={onNew}>Start your first interview</PrimaryButton>
        </Card>
      ) : (
        groups.map(([label, items]) => (
          <section key={label} className="history-group">
            <h2 className="history-day">{label}</h2>
            <ul className="history-list">
              {items.map((entry) => (
                <li key={entry.id}>
                  <div
                    className="history-row"
                    role="button"
                    tabIndex={0}
                    aria-disabled={busyId !== null || deletingId !== null || loading}
                    onClick={() => {
                      if (busyId !== null || deletingId !== null || loading) return;
                      onSelect(entry);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      if (busyId !== null || deletingId !== null || loading) return;
                      onSelect(entry);
                    }}
                  >
                    <span className="history-main">
                      <strong>{entry.interviewType ?? "Coding"}</strong>
                      <span className="hint">{entry.status.replace(/_/g, " ")}</span>
                    </span>
                    <span className="history-score">
                      {entry.overallScore !== undefined && `${entry.overallScore.toFixed(1)} / 10`}
                    </span>
                    <span className="history-meta">
                      <span className="badge">{evaluationLabel(entry.evaluationStatus)}</span>
                      {entry.difficulty !== undefined && <span className="badge">{entry.difficulty}</span>}
                      <span className="hint">{entry.durationMin === undefined ? "" : `${entry.durationMin} min`}</span>
                    </span>
                    <span className="history-action">
                      <PrimaryButton
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(entry);
                        }}
                        disabled={busyId !== null || deletingId !== null || loading}
                      >
                        {busyId === entry.id || loading ? "Loading…" : "Review"}
                      </PrimaryButton>
                      <GhostButton
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(entry);
                        }}
                        disabled={(deletingId !== null && deletingId !== entry.id) || busyId !== null || loading}
                      >
                        {deletingId === entry.id ? "Deleting…" : "Delete"}
                      </GhostButton>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {hasMore && (
        <div className="row actions">
          <GhostButton onClick={onLoadMore} disabled={busyId !== null || deletingId !== null || loading}>
            {loading ? "Loading…" : "Load more"}
          </GhostButton>
        </div>
      )}

      <div className="row actions">
        <PrimaryButton onClick={onNew}>Start new interview</PrimaryButton>
      </div>
    </>
  );
}
