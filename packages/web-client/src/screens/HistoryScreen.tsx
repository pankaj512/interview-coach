// H-History (ux-spec §26): server-kept record as a flat table; detail views
// re-fetch canonical state. Filters, per-row delete, and pagination are kept;
// scores render verbatim in canonical /100 units.

import { useMemo, useState } from "react";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, ChipList, Pill } from "../ds/primitives.js";
import { formatRecommendation } from "../progress.js";
import type { HistoryEntry } from "../history.js";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

  const frozen = busyId !== null || deletingId !== null || loading;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Interview history</h1>
          <p className="lede">Your completed interviews and their scores. Opening a row loads its full detail.</p>
        </div>
        <PrimaryButton onClick={onNew}>Start new interview</PrimaryButton>
      </div>
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
          placeholder="Search interviews..."
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
          {entries.length === 0 ? (
            <>
              <h2>No interviews to show yet</h2>
              <p className="hint">Your recent sessions will appear here once you complete one.</p>
              <PrimaryButton onClick={onNew}>Start practice</PrimaryButton>
            </>
          ) : (
            <p>No interviews match your filters.</p>
          )}
        </Card>
      ) : (
        <Card className="table-card">
          <table className="hist-table">
            <caption className="visually-hidden">
              {filtered.length === 1 ? "1 session" : `${filtered.length} sessions`}
            </caption>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Date</th>
                <th scope="col">Score</th>
                <th scope="col">Evaluation</th>
                <th scope="col">Difficulty</th>
                <th scope="col">
                  <span className="visually-hidden">Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.interviewType ?? "Coding"}</strong>{" "}
                    <span className="hint">{entry.status.replace(/_/g, " ")}</span>
                  </td>
                  <td>{shortDate(entry.at)}</td>
                  <td className="score">{entry.overallScore === undefined ? "" : `${entry.overallScore} / 100`}</td>
                  <td>
                    {entry.recommendation === undefined || entry.recommendation === "" ? (
                      <span className="pill">{evaluationLabel(entry.evaluationStatus)}</span>
                    ) : (
                      <span className="pill hot">{formatRecommendation(entry.recommendation)}</span>
                    )}
                  </td>
                  <td>{entry.difficulty === undefined ? <span className="hint">-</span> : <span className="pill">{entry.difficulty}</span>}</td>
                  <td className="hist-actions">
                    <PrimaryButton onClick={() => onSelect(entry)} disabled={frozen}>
                      {busyId === entry.id || loading ? "Loading..." : "Review"}
                    </PrimaryButton>
                    <GhostButton
                      onClick={() => onDelete(entry)}
                      disabled={(deletingId !== null && deletingId !== entry.id) || busyId !== null || loading}
                    >
                      {deletingId === entry.id ? "Deleting..." : "Delete"}
                    </GhostButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {hasMore && (
        <div className="row actions">
          <GhostButton onClick={onLoadMore} disabled={frozen}>
            {loading ? "Loading..." : "Load more"}
          </GhostButton>
        </div>
      )}
    </>
  );
}
