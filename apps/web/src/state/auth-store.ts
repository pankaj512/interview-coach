// @interview-coach/web - auth session store.
//
// Owns: the active account session outside React so every client shares
// it, persisted for restore. Surprising: the token is a bearer secret -
// sent on calls, never logged or rendered.
//
// History: S8c; see docs/SESSION_HANDOFF.md.

import { useSyncExternalStore } from "react";

export interface StoredSession {
  readonly token: string;
  readonly email: string;
  readonly displayName: string;
}

const STORAGE_KEY = "interview-coach.auth-session";
const MAX_STORED_CHARS = 8_192;

interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryFallback = new Map<string, string>();
const memoryStorage: StringStorage = {
  getItem: (key) => memoryFallback.get(key) ?? null,
  setItem: (key, value) => {
    memoryFallback.set(key, value);
  },
  removeItem: (key) => {
    memoryFallback.delete(key);
  },
};

function storage(): StringStorage {
  try {
    const ls = (globalThis as { localStorage?: unknown })["localStorage"];
    if (
      typeof ls === "object" &&
      ls !== null &&
      typeof (ls as StringStorage).getItem === "function"
    ) {
      return ls as StringStorage;
    }
  } catch {
    // No DOM (tests/SSR): fall through to memory.
  }
  return memoryStorage;
}

function toStoredSession(parsed: unknown): StoredSession | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (
    typeof record["token"] !== "string" ||
    record["token"] === "" ||
    typeof record["email"] !== "string" ||
    typeof record["displayName"] !== "string"
  ) {
    return null;
  }
  return {
    token: record["token"],
    email: record["email"],
    displayName: record["displayName"],
  };
}

function loadStored(): StoredSession | null {
  try {
    const raw = storage().getItem(STORAGE_KEY);
    if (raw === null || raw === "") return null;
    return toStoredSession(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

let current: StoredSession | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function ensureInitialized(): void {
  if (!initialized) {
    initialized = true;
    current = loadStored();
  }
}

function persist(next: StoredSession | null): void {
  try {
    if (next === null) {
      storage().removeItem(STORAGE_KEY);
    } else {
      const raw = JSON.stringify(next);
      if (raw.length <= MAX_STORED_CHARS) storage().setItem(STORAGE_KEY, raw);
    }
  } catch {
    // Corrupt or full storage: keep the in-memory session only.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function getAuthSession(): StoredSession | null {
  ensureInitialized();
  return current;
}

export function setAuthSession(next: StoredSession): void {
  ensureInitialized();
  const valid = toStoredSession(next);
  if (valid === null) return;
  current = valid;
  persist(valid);
  emit();
}

export function clearAuthSession(): void {
  ensureInitialized();
  current = null;
  persist(null);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAuthSession(): StoredSession | null {
  return useSyncExternalStore(subscribe, getAuthSession, () => null);
}
