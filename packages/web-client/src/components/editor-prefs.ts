// Candidate editor-language preference (interview room > Editor).
//
// Mirrors `voice/voice-prefs.ts`: the language set is closed
// (`CodeLanguage` in `api/types.ts`), so unknown or empty stored values read
// back as null and Python stays the default. The stored preference never
// leaves the client as its own value - it only seeds the editor's initial
// language; every Test submission still carries the live selector value.

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
