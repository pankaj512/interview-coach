// Design-system state model.
//
// Owns: pure mappings from live interview state to icon + label pairs
// (state is never color-alone).
//
// History: ux-spec; see docs/SESSION_HANDOFF.md.

import type { VoiceConnectionState } from "../voice/voice-client.js";

export type ChipState =
  | "connected"
  | "reconnecting"
  | "micBlocked"
  | "idle"
  | "connecting"
  | "closed"
  | "failed";

export interface ChipView {
  readonly state: ChipState;
  /** Icon glyph - always paired with `label`, never color-alone. */
  readonly icon: string;
  readonly label: string;
}

const CHIP_VIEWS: Record<ChipState, ChipView> = {
  connected: { state: "connected", icon: "●", label: "Connected" },
  reconnecting: { state: "reconnecting", icon: "◌", label: "Reconnecting" },
  micBlocked: { state: "micBlocked", icon: "⌀", label: "Mic blocked" },
  idle: { state: "idle", icon: "○", label: "Not joined" },
  connecting: { state: "connecting", icon: "◌", label: "Connecting" },
  closed: { state: "closed", icon: "○", label: "Session closed" },
  failed: { state: "failed", icon: "✕", label: "Connection failed" },
};

/** Map the voice connection + mic-gate state to a status-chip view (ux-spec §4). */
export function chipViewFor(connection: VoiceConnectionState, micBlocked: boolean): ChipView {
  if (micBlocked) return CHIP_VIEWS["micBlocked"] ?? { state: "micBlocked", icon: "⌀", label: "Mic blocked" };
  switch (connection) {
    case "connected":
      return CHIP_VIEWS["connected"] ?? { state: "connected", icon: "●", label: "Connected" };
    case "reconnecting":
      return CHIP_VIEWS["reconnecting"] ?? { state: "reconnecting", icon: "◌", label: "Reconnecting" };
    case "connecting":
      return CHIP_VIEWS["connecting"] ?? { state: "connecting", icon: "◌", label: "Connecting" };
    case "closed":
      return CHIP_VIEWS["closed"] ?? { state: "closed", icon: "○", label: "Session closed" };
    case "failed":
      return CHIP_VIEWS["failed"] ?? { state: "failed", icon: "✕", label: "Connection failed" };
    case "idle":
    default:
      return CHIP_VIEWS["idle"] ?? { state: "idle", icon: "○", label: "Not joined" };
  }
}

// ux-spec §12: Connecting, Listening, User speaking, AI thinking, AI
// speaking, Paused, Error - plus Muted (the candidate muted the mic).
export type VoicePhase =
  | "connecting"
  | "listening"
  | "userSpeaking"
  | "thinking"
  | "speaking"
  | "paused"
  | "muted"
  | "error";

export interface VoiceView {
  readonly phase: VoicePhase;
  readonly icon: string;
  readonly label: string;
}

const VOICE_VIEWS: Record<VoicePhase, VoiceView> = {
  connecting: { phase: "connecting", icon: "◌", label: "Connecting..." },
  listening: { phase: "listening", icon: "◎", label: "Listening" },
  userSpeaking: { phase: "userSpeaking", icon: "●", label: "You're speaking" },
  thinking: { phase: "thinking", icon: "◌", label: "Thinking..." },
  speaking: { phase: "speaking", icon: "◉", label: "Interviewer speaking" },
  paused: { phase: "paused", icon: "Ⅱ", label: "Interview paused" },
  muted: { phase: "muted", icon: "⌀", label: "Muted" },
  error: { phase: "error", icon: "!", label: "Voice connection lost" },
};

/** Map speaker/connection/mute/pause flags to the voice-rail phase (ux-spec §12). */
export function voiceViewFor(input: {
  readonly assistantSpeaking: boolean;
  readonly candidateSpeaking: boolean;
  readonly connection: VoiceConnectionState;
  readonly micBlocked: boolean;
  readonly muted?: boolean;
  readonly paused?: boolean;
}): VoiceView {
  const view = (phase: VoicePhase): VoiceView =>
    VOICE_VIEWS[phase] ?? { phase: phase, icon: "○", label: "Unknown" };
  if (input.paused) return view("paused");
  if (input.muted || input.micBlocked) return view("muted");
  if (input.connection === "failed" || input.connection === "closed") return view("error");
  if (input.connection === "connecting" || input.connection === "reconnecting") return view("connecting");
  if (input.assistantSpeaking) return view("speaking");
  if (input.candidateSpeaking) return view("userSpeaking");
  return view("listening");
}

/** Timer is ambient and non-anxiety: Low only under 5 minutes remaining. */
export function timerStatus(secondsLeft: number | null): "normal" | "low" {
  if (secondsLeft === null) return "normal";
  return secondsLeft < 5 * 60 ? "low" : "normal";
}

/** Remaining-time countdown, clamped at zero; null when no duration is configured. */
export function secondsLeftFor(durationMinutes: number | undefined, elapsedSec: number): number | null {
  if (durationMinutes === undefined || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }
  return Math.max(0, Math.round(durationMinutes * 60 - elapsedSec));
}

/** mm:ss for countdown/count-up display (tabular numerals in CSS). */
export function formatClock(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
