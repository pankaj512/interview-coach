// S6 design-system state model (ux-spec §2 + §4).
//
// Pure mappings from live interview state to design-system presentation.
// State is never color-alone: every mapping yields an icon + label pair.
// Tested in tests/ds-model.test.ts; rendered by ds/status.tsx.

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
  /** Icon glyph — always paired with `label`, never color-alone. */
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

export type VoicePhase = "speaking" | "listening" | "thinking" | "muted";

export interface VoiceView {
  readonly phase: VoicePhase;
  readonly icon: string;
  readonly label: string;
}

const VOICE_VIEWS: Record<VoicePhase, VoiceView> = {
  speaking: { phase: "speaking", icon: "◉", label: "Speaking" },
  listening: { phase: "listening", icon: "◎", label: "Listening" },
  thinking: { phase: "thinking", icon: "◌", label: "Thinking" },
  muted: { phase: "muted", icon: "⌀", label: "Muted" },
};

/** Map speaker/connection flags to the voice-rail phase (ux-spec §4 `<VoiceState>`). */
export function voiceViewFor(input: {
  readonly assistantSpeaking: boolean;
  readonly candidateSpeaking: boolean;
  readonly connection: VoiceConnectionState;
  readonly micBlocked: boolean;
}): VoiceView {
  if (input.micBlocked) {
    return VOICE_VIEWS["muted"] ?? { phase: "muted", icon: "⌀", label: "Muted" };
  }
  if (input.connection === "connecting" || input.connection === "reconnecting") {
    return VOICE_VIEWS["thinking"] ?? { phase: "thinking", icon: "◌", label: "Thinking" };
  }
  if (input.assistantSpeaking) {
    return VOICE_VIEWS["speaking"] ?? { phase: "speaking", icon: "◉", label: "Speaking" };
  }
  void input.candidateSpeaking;
  return VOICE_VIEWS["listening"] ?? { phase: "listening", icon: "◎", label: "Listening" };
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
