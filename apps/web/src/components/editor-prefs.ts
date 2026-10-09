// Candidate editor-language preference.
//
// Owns: persisting the room editor language (closed CodeLanguage set;
// unknown values read back as null, Python default). Surprising: mirrors
// voice-prefs; the stored value only seeds the editor, never submits.
//
// History: room hardening; see docs/SESSION_HANDOFF.md.

import type { CodeLanguage } from "../api/types.js";

export const EDITOR_LANGUAGES: readonly CodeLanguage[] = ["javascript", "python", "cpp"];

// The editor language when no preference is stored. Matches the hardcoded
// initial state `CodeWorkspace` used before this preference existed.
export const DEFAULT_EDITOR_LANGUAGE: CodeLanguage = "python";

const STORAGE_KEY = "ic.editor-language";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadEditorLanguage(): CodeLanguage | null {
  const store = storage();
  if (store === null) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const name = raw.trim();
  return (EDITOR_LANGUAGES as readonly string[]).includes(name) ? (name as CodeLanguage) : null;
}

export function saveEditorLanguage(language: CodeLanguage): void {
  const store = storage();
  if (store === null) return;
  try {
    if ((EDITOR_LANGUAGES as readonly string[]).includes(language)) {
      store.setItem(STORAGE_KEY, language);
    }
  } catch {
    // Private-mode storage failures keep the Python default; never throw.
  }
}
