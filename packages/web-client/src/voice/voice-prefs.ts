// Interviewer-voice preference (Settings > Voice).
//
// The Azure realtime voice set is closed: the backend documents the same
// list next to `AZURE_VOICE_VOICE` and rejects anything else on
// session.voice. The stored preference never leaves the client as its own
// value — it only overrides `session.voice` in the client-built
// session.update, with the server mint as the default. Unknown or empty
// stored values read back as null so they can never reach the wire.

export const REALTIME_VOICES: readonly string[] = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
];

const STORAGE_KEY = "ic.voice";

// The voice the service uses when no preference is stored. Mirrors the
// backend `AZURE_VOICE_VOICE` fallback, so the Settings dropdown can show
// the real default instead of a "server default" placeholder entry.
export const DEFAULT_VOICE = "alloy";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadVoicePreference(): string | null {
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
  return (REALTIME_VOICES as readonly string[]).includes(name) ? name : null;
}

export function saveVoicePreference(name: string): void {
  const store = storage();
  if (store === null) return;
  try {
    if (name === "") {
      store.removeItem(STORAGE_KEY);
    } else if ((REALTIME_VOICES as readonly string[]).includes(name)) {
      store.setItem(STORAGE_KEY, name);
    }
  } catch {
    // Private-mode storage failures keep the server default; never throw.
  }
}
