// @interview-coach/web - lobby readiness and gating.
//
// Owns: the pure "Begin interview" gating rule (mic permission plus server
// voice readiness), kept here so it tests without a browser or backend.
//
// History: Phase 6; see docs/SESSION_HANDOFF.md.

export type MicState = "checking" | "ready" | "denied" | "unsupported";

export type SessionReadiness = "checking" | "ready" | "unconfigured" | "error";

// The backend reports its voice credential mode from /api/ready. Every
// configured mode can mint; only "unconfigured" means Start would 503 (audit
// F8-3), so the Lobby blocks it with an actionable message instead.
export function sessionReadinessFromVoiceMode(
  voiceMode: string | null | undefined,
): SessionReadiness {
  if (voiceMode === null || voiceMode === undefined || voiceMode.trim() === "") {
    return "error";
  }
  return voiceMode === "unconfigured" ? "unconfigured" : "ready";
}

// Start is enabled only when both the microphone and the session are ready.
export function canBegin(mic: MicState, session: SessionReadiness): boolean {
  return mic === "ready" && session === "ready";
}

export function micReadyLabel(mic: MicState): string {
  switch (mic) {
    case "ready":
      return "Microphone ready";
    case "checking":
      return "Checking microphone...";
    case "denied":
      return "Microphone blocked";
    case "unsupported":
      return "Microphone unavailable";
  }
}

export function sessionReadyLabel(session: SessionReadiness): string {
  switch (session) {
    case "ready":
      return "Session ready";
    case "checking":
      return "Preparing session...";
    case "unconfigured":
      return "Voice unavailable";
    case "error":
      return "Couldn't verify session";
  }
}
