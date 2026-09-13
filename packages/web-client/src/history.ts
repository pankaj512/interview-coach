// Interview history (H-History / Dashboard / Progress).
//
// Backend owns truth; the browser keeps a lightweight local index of
// interviews created in it (localStorage, cap 20) so history, dashboard
// summaries, and progress trends can render without a listing endpoint.
// Detail views always re-fetch canonical state from the backend; entries
// missing server-side are marked stale, never invented.

import type { InterviewStatus } from "./api/types.js";

export interface HistoryEntry {
  readonly id: string;
  readonly candidateId: string;
  readonly status: InterviewStatus;
  readonly at: string;
  /** Presentation metadata captured at end-of-session (optional). */
  readonly interviewType?: string;
  readonly difficulty?: string;
  readonly mode?: string;
  readonly durationMin?: number;
  readonly overallScore?: number;
  readonly recommendation?: string;
  readonly hintsUsed?: number;
  readonly strengths?: readonly string[];
  readonly weaknesses?: readonly string[];
  readonly dimensions?: Readonly<Record<string, number>>;
}

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const HISTORY_KEY = "ic.history";
const HISTORY_CAP = 20;

function asStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length > 0 ? out : undefined;
}

function asDimensions(value: unknown): Readonly<Record<string, number>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const score = typeof raw === "number" ? raw : typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)["score"] : undefined;
    if (typeof score === "number" && Number.isFinite(score)) out[key] = score;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

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
      type MutableHistoryEntry = { -readonly [K in keyof HistoryEntry]: HistoryEntry[K] };
      const entry: MutableHistoryEntry = {
        id: record["id"] as string,
        candidateId: record["candidateId"] as string,
        status: typeof record["status"] === "string" ? (record["status"] as InterviewStatus) : "completed",
        at: typeof record["at"] === "string" ? (record["at"] as string) : new Date(0).toISOString(),
      };
      if (typeof record["interviewType"] === "string") entry.interviewType = record["interviewType"];
      if (typeof record["difficulty"] === "string") entry.difficulty = record["difficulty"];
      if (typeof record["mode"] === "string") entry.mode = record["mode"];
      if (typeof record["durationMin"] === "number") entry.durationMin = record["durationMin"];
      if (typeof record["overallScore"] === "number") entry.overallScore = record["overallScore"];
      if (typeof record["recommendation"] === "string") entry.recommendation = record["recommendation"];
      if (typeof record["hintsUsed"] === "number") entry.hintsUsed = record["hintsUsed"];
      const strengths = asStringArray(record["strengths"]);
      if (strengths !== undefined) entry.strengths = strengths;
      const weaknesses = asStringArray(record["weaknesses"]);
      if (weaknesses !== undefined) entry.weaknesses = weaknesses;
      const dimensions = asDimensions(record["dimensions"]);
      if (dimensions !== undefined) entry.dimensions = dimensions;
      entries.push(entry);
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

export function clearHistory(storage: HistoryStorage): void {
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify([]));
  } catch {
    // best-effort
  }
}
