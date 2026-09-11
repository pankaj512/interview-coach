// S6 interview history (H-History screen).
//
// Backend owns truth; the browser keeps a lightweight local index of
// interviews created in it (localStorage, cap 20) so H-History can list →
// result detail. Detail views always re-fetch canonical state from the
// backend; entries missing server-side are marked stale, never invented.

import type { InterviewStatus } from "./api/types.js";

export interface HistoryEntry {
  readonly id: string;
  readonly candidateId: string;
  readonly status: InterviewStatus;
  readonly at: string;
}

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const HISTORY_KEY = "ic.history";
const HISTORY_CAP = 20;

export function loadHistory(storage: HistoryStorage): readonly HistoryEntry[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(HISTORY_KEY);
  } catch {
    return [];
  }
  if (raw === null || raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: HistoryEntry[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      if (typeof record["id"] !== "string" || typeof record["candidateId"] !== "string") continue;
      entries.push({
        id: record["id"] as string,
        candidateId: record["candidateId"] as string,
        status: typeof record["status"] === "string" ? (record["status"] as InterviewStatus) : "completed",
        at: typeof record["at"] === "string" ? (record["at"] as string) : new Date(0).toISOString(),
      });
    }
    return entries.slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

export function recordHistory(
  storage: HistoryStorage,
  entry: HistoryEntry,
): readonly HistoryEntry[] {
  const next = [entry, ...loadHistory(storage).filter((e) => e.id !== entry.id)].slice(0, HISTORY_CAP);
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Full/blocked storage: history is best-effort; the interview itself is safe server-side.
  }
  return next;
}
