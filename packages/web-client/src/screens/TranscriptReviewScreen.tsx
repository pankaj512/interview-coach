// H-Transcript-Review (ux-spec §25): full timestamped transcript + export.
// Turns come from the live session first; History entries carry no live
// events, so an empty event list falls back to the server transcript.

import { useEffect, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedInterview, SerializedInterviewMessage } from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import type { LiveEvent } from "../state/use-interview.js";

export interface TranscriptTurn {
  readonly at: string;
  readonly role: "Interviewer" | "You";
  readonly text: string;
}

export function transcriptTurns(
  events: readonly LiveEvent[],
  messages: readonly SerializedInterviewMessage[],
): readonly TranscriptTurn[] {
  const live: TranscriptTurn[] = [];
  for (const event of events) {
    if (event.kind === "assistant") live.push({ at: event.at, role: "Interviewer", text: event.detail });
    else if (event.kind === "candidate") live.push({ at: event.at, role: "You", text: event.detail });
  }
  if (live.length > 0) return live;
  const server: TranscriptTurn[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    server.push({
      at: message.createdAt,
      role: message.role === "interviewer" ? "Interviewer" : "You",
      text: message.content,
    });
  }
  return server;
}

function formatOffset(iso: string, baseMs: number | null): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms) || baseMs === null) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const totalSec = Math.max(0, Math.floor((ms - baseMs) / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function TranscriptReviewScreen({
  backend,
  interview,
  events,
  onWeakAreas,
  onBack,
}: {
  readonly backend: BackendClient;
  readonly interview: SerializedInterview;
  readonly events: readonly LiveEvent[];
  readonly onWeakAreas: () => void;
  readonly onBack: () => void;
}) {
  const liveCount = events.length;
  const [serverMessages, setServerMessages] = useState<readonly SerializedInterviewMessage[] | null>(null);
  useEffect(() => {
    if (liveCount > 0) return;
    let cancelled = false;
    void backend
      .getTranscript(interview.id)
      .then((messages) => {
        if (!cancelled) setServerMessages(messages);
      })
      .catch(() => {
        if (!cancelled) setServerMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [backend, interview.id, liveCount]);

  const turns = transcriptTurns(events, serverMessages ?? []);
  const loading = liveCount === 0 && serverMessages === null;
  const baseMs = Date.parse(interview.startedAt ?? interview.createdAt);

  function exportTranscript() {
    const body = turns.map((t) => `[${formatOffset(t.at, baseMs)}] ${t.role}\n${t.text}\n`).join("\n");
    const header = `Interview Coach transcript\nInterview: ${interview.id}\nCandidate: ${interview.candidateId}\n\n`;
    const blob = new Blob([header + body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${interview.id}-transcript.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <p className="page-meta">Interview transcript</p>
      <h1 className="page-title">How the session read</h1>

      {loading ? (
        <Card>
          <p className="hint">Loading transcript…</p>
        </Card>
      ) : turns.length === 0 ? (
        <Card>
          <p className="hint">No transcript turns captured for this session.</p>
        </Card>
      ) : (
        <div className="turn-list">
          {turns.map((turn, i) => (
            <div key={i} className={turn.role === "You" ? "turn you" : "turn interviewer"}>
              <span className="turn-who">{turn.role}</span>
              <span className="turn-ts">{formatOffset(turn.at, baseMs)}</span>
              <p>{turn.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="row actions">
        <GhostButton onClick={onBack}>Back to results</GhostButton>
        <GhostButton onClick={exportTranscript}>Export transcript</GhostButton>
        <PrimaryButton onClick={onWeakAreas}>Practice weak areas</PrimaryButton>
      </div>
    </>
  );
}
