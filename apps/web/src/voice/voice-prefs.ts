// Interviewer-voice preference.
//
// Owns: persisting the Settings voice choice (closed voice set; unknown
// values read back as null so they never reach the wire). Surprising: the
// stored value only overrides session.voice in the client-built update,
// with the server mint as the default.
//
// History: Settings; see docs/SESSION_HANDOFF.md.

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
