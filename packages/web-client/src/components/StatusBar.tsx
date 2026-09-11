// HLD 4.2 — connection / speaker / timer status bar (S4).

import type { VoiceConnectionState } from "../voice/voice-client.js";

export function formatElapsed(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const CONNECTION_LABEL: Record<VoiceConnectionState, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  closed: "Closed",
  failed: "Failed",
};

export function StatusBar({
  connection,
  assistantSpeaking,
  candidateSpeaking,
  elapsedSec,
  onEnd,
  busy,
}: {
  connection: VoiceConnectionState;
  assistantSpeaking: boolean;
  candidateSpeaking: boolean;
  elapsedSec: number;
  onEnd: () => void;
  busy: boolean;
}) {
  return (
    <div className="statusbar">
      <span className={`dot ${connection}`} title={connection} />
      <strong>{CONNECTION_LABEL[connection]}</strong>
      <span className="sep">·</span>
      <span className={assistantSpeaking ? "speaking" : "quiet"}>
        {assistantSpeaking ? "Assistant speaking" : "Assistant idle"}
      </span>
      <span className="sep">·</span>
      <span className={candidateSpeaking ? "speaking" : "quiet"}>
        {candidateSpeaking ? "You speaking" : "Mic open"}
      </span>
      <span className="sep">·</span>
      <span className="timer" title="Elapsed interview time">
        {formatElapsed(elapsedSec)}
      </span>
      <span className="spacer" />
      <button type="button" className="danger" disabled={busy || connection !== "connected"} onClick={onEnd}>
        End interview
      </button>
    </div>
  );
}
