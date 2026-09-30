// @interview-coach/web-client - pending call_id persistence (frozen section 5).
//
// "On reload rehydrate pending `call_id`s from sessionStorage via
// `GET tool-results`." The ledger owns submission; this module owns the
// reload-surviving copy. Storage is injected (`sessionStorage` in prod, a
// Map-backed fake in tests) so the logic stays DOM-free and unit-testable.

export const PENDING_CALL_IDS_KEY = "ic.pending-tool-calls.v1";
export const PENDING_CALL_IDS_CAP = 20;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadPendingCallIds(storage: KeyValueStorage): readonly string[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(PENDING_CALL_IDS_KEY);
  } catch {
    return [];
  }
  if (raw === null || raw.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((entry): entry is string => typeof entry === "string" && entry !== "");
    return ids.slice(0, PENDING_CALL_IDS_CAP);
  } catch {
    return [];
  }
}

export function savePendingCallIds(storage: KeyValueStorage, callIds: readonly string[]): void {
  const bounded = [...new Set(callIds.filter((id) => id !== ""))].slice(0, PENDING_CALL_IDS_CAP);
  try {
    if (bounded.length === 0) {
      storage.removeItem(PENDING_CALL_IDS_KEY);
      return;
    }
    storage.setItem(PENDING_CALL_IDS_KEY, JSON.stringify(bounded));
  } catch {
    // Storage full or unavailable (private mode): pending recovery degrades
    // to in-memory only. Never break the interview over persistence.
  }
}

export function addPendingCallId(storage: KeyValueStorage, callId: string): void {
  if (callId === "") return;
  savePendingCallIds(storage, [callId, ...loadPendingCallIds(storage)]);
}

export function removePendingCallId(storage: KeyValueStorage, callId: string): void {
  savePendingCallIds(
    storage,
    loadPendingCallIds(storage).filter((id) => id !== callId),
  );
}

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
