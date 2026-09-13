// Design-system status components (ux-spec §4/§12).
//
// chip-status, voice-state (Connecting/Listening/You're speaking/Thinking/
// Interviewer speaking/Paused/Muted/Error), timer, caption, diff-pill,
// score-bar. All state renders icon + label — never color-alone.

import { chipViewFor, formatClock, timerStatus, voiceViewFor, type ChipState } from "./model.js";
import type { VoiceConnectionState } from "../voice/voice-client.js";

export function StatusChip({
  connection,
  micBlocked = false,
}: {
  readonly connection: VoiceConnectionState;
  readonly micBlocked?: boolean;
}) {
  const view = chipViewFor(connection, micBlocked);
  return (
    <span className={`chip-status chip-${view.state}`} role="status" aria-label={`Connection: ${view.label}`}>
      <span className="chip-icon" aria-hidden="true">
        {view.icon}
      </span>
      <span className="chip-label">{view.label}</span>
    </span>
  );
}

export function VoiceState({
  assistantSpeaking,
  candidateSpeaking,
  connection,
  micBlocked = false,
  muted = false,
  paused = false,
}: {
  readonly assistantSpeaking: boolean;
  readonly candidateSpeaking: boolean;
  readonly connection: VoiceConnectionState;
  readonly micBlocked?: boolean;
  readonly muted?: boolean;
  readonly paused?: boolean;
}) {
  const view = voiceViewFor({ assistantSpeaking, candidateSpeaking, connection, micBlocked, muted, paused });
  return (
    <span className={`voice-state voice-${view.phase}`} role="status" aria-label={`Voice: ${view.label}`}>
      <span className="voice-icon" aria-hidden="true">
        {view.icon}
      </span>
      <span className="voice-label">{view.label}</span>
    </span>
  );
}

export function Timer({
  secondsLeft,
  elapsedSec,
}: {
  /** Countdown target; null when no duration configured (count-up instead). */
  readonly secondsLeft: number | null;
  readonly elapsedSec: number;
}) {
  const status = timerStatus(secondsLeft);
  const text = secondsLeft === null ? formatClock(elapsedSec) : formatClock(secondsLeft);
  const label = secondsLeft === null ? `Elapsed ${text}` : `Remaining ${text}`;
  return (
    <span className={`timer timer-${status}`} role="timer" aria-label={label} title={label}>
      <span className="timer-icon" aria-hidden="true">
        {status === "low" ? "◷" : "○"}
      </span>
      <span className="timer-text">{text}</span>
      {status === "low" && <span className="timer-flag">low time</span>}
    </span>
  );
}

export function Caption({ role, text }: { readonly role: "assistant" | "you"; readonly text: string }) {
  const label = role === "assistant" ? "Interviewer" : "You";
  return (
    <p className={`caption caption-${role}`}>
      <span className="caption-role">{label}</span>
      <span className="caption-text">{text}</span>
    </p>
  );
}

export function DiffPill({ level }: { readonly level: string }) {
  const normalized = level === "Easy" || level === "Medium" || level === "Hard" ? level : "Medium";
  return (
    <span className={`diff-pill diff-${normalized.toLowerCase()}`} aria-label={`Difficulty: ${normalized}`}>
      <span className="diff-icon" aria-hidden="true">
        ◆
      </span>
      <span className="diff-label">{normalized}</span>
    </span>
  );
}

export type { ChipState };

export function ScoreBar({ label, value, max = 5 }: { readonly label: string; readonly value: number; readonly max?: number }) {
  const clamped = Math.min(max, Math.max(0, value));
  const percent = Math.round((clamped / max) * 100);
  return (
    <div className="score-bar" role="img" aria-label={`${label}: ${clamped} out of ${max}`}>
      <span className="score-label">{label}</span>
      <span className="score-track" aria-hidden="true">
        <span className="score-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="score-value">{clamped}</span>
    </div>
  );
}
