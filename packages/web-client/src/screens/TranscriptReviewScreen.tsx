// H-Transcript-Review (ux-spec §25): full timestamped transcript + export.

import type { SerializedInterview } from "../api/types.js";
import { GhostButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import type { LiveEvent } from "../state/use-interview.js";

interface Turn {
  readonly at: string;
  readonly role: "Interviewer" | "You";
  readonly text: string;
}

function turnsFrom(events: readonly LiveEvent[]): readonly Turn[] {
  const turns: Turn[] = [];
  for (const event of events) {
    if (event.kind === "assistant") turns.push({ at: event.at, role: "Interviewer", text: event.detail });
    else if (event.kind === "candidate") turns.push({ at: event.at, role: "You", text: event.detail });
  }
  return turns;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TranscriptReviewScreen({
  interview,
  events,
  onBack,
}: {
  readonly interview: SerializedInterview;
  readonly events: readonly LiveEvent[];
  readonly onBack: () => void;
}) {
  const turns = turnsFrom(events);

  function exportTranscript() {
    const body = turns.map((t) => `[${formatTime(t.at)}] ${t.role}\n${t.text}\n`).join("\n");
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
      <p className="eyebrow">Transcript</p>
      <h1 className="page-title">Interview transcript</h1>
      <p className="lede">Full session · important moments marked · export available</p>

      <div className="transcript-grid">
        <Card className="transcript-card">
          {turns.length === 0 ? (
            <p className="hint">No transcript turns captured for this session.</p>
          ) : (
            <ol className="transcript-list">
              {turns.map((turn, i) => (
                <li key={i} className={`turn turn-${turn.role === "Interviewer" ? "assistant" : "you"}`}>
                  <span className="turn-time">{formatTime(turn.at)}</span>
                  <span className="turn-role">{turn.role}</span>
                  <p className="turn-text">{turn.text}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <div className="transcript-side">
          <Card>
            <h3 className="section-title">Marked moments</h3>
            <p className="hint">Important moments are marked by the coach as the evaluation is produced.</p>
            <p className="hint">No moments marked yet.</p>
          </Card>
          <Card>
            <h3 className="section-title">Labels</h3>
            <ul className="plain-list">
              <li>Strong answer</li>
              <li>Weak answer</li>
              <li>Missed opportunity</li>
              <li>Good follow-up</li>
              <li>Important trade-off</li>
            </ul>
            <GhostButton onClick={exportTranscript}>Export transcript</GhostButton>
          </Card>
        </div>
      </div>

      <div className="row actions">
        <GhostButton onClick={onBack}>Back to Results</GhostButton>
      </div>
    </>
  );
}
