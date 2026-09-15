// H-Transcript-Review (ux-spec §25): full timestamped transcript + export.

import type { SerializedInterview } from "../api/types.js";
import { GhostButton } from "../ds/buttons.js";
import { Badge, Card, ChipList, SectionHead, TimelineRow } from "../ds/primitives.js";
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
      <ChipList label="Transcript">
        <Badge tone="neutral">Full session</Badge>
        <Badge tone="neutral">{turns.length} turns</Badge>
      </ChipList>
      <h1 className="page-title">Interview transcript</h1>
      <p className="lede">Timestamped turns · important moments marked · export available</p>

      <div className="transcript-grid">
        <Card className="transcript-card">
          <SectionHead title="Timeline" meta={`${turns.length} turns`} />
          {turns.length === 0 ? (
            <p className="hint">No transcript turns captured for this session.</p>
          ) : (
            <ol className="transcript-list">
              {turns.map((turn, i) => (
                <TimelineRow
                  key={i}
                  time={formatTime(turn.at)}
                  role={turn.role}
                  tags={
                    i === turns.length - 1 ? (
                      <ChipList>
                        <Badge tone="active">Latest</Badge>
                      </ChipList>
                    ) : undefined
                  }
                >
                  {turn.text}
                </TimelineRow>
              ))}
            </ol>
          )}
        </Card>
        <div className="transcript-side">
          <Card>
            <SectionHead title="Marked moments" />
            <p className="hint">Important moments are marked by the coach as the evaluation is produced.</p>
            <p className="hint">No moments marked yet.</p>
          </Card>
          <Card>
            <SectionHead title="Labels" />
            <ChipList label="Moment labels">
              <Badge tone="pass">Strong answer</Badge>
              <Badge tone="review">Weak answer</Badge>
              <Badge tone="neutral">Missed opportunity</Badge>
              <Badge tone="neutral">Good follow-up</Badge>
              <Badge tone="active">Important trade-off</Badge>
            </ChipList>
            <div className="row actions">
              <GhostButton onClick={exportTranscript}>Export transcript</GhostButton>
            </div>
          </Card>
        </div>
      </div>

      <div className="row actions">
        <GhostButton onClick={onBack}>Back to Results</GhostButton>
      </div>
    </>
  );
}
