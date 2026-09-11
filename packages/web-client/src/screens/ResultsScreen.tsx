// H-Results — debrief (HLD 4.5, ux-spec §1/§2).
//
// HLD 5.8 dimension bars (all 8 backend-returned keys — the HLD set is
// normative; the spec's "6 bars" render as the 6 keys present when the
// backend returns 6), strengths/weaknesses, hints header, timeline,
// transcript highlights, next-practice curriculum link.
//
// Transcript highlight rule (spec §9 Q4, resolved): manual — the latest 6
// transcript/candidate turns verbatim. Auto-summarization is deferred.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedEvaluation, SerializedStateSnapshot } from "../api/types.js";
import { EvaluationForm } from "../components/EvaluationForm.js";
import { ExecutionPanel } from "../components/ExecutionPanel.js";
import { nextPractice } from "../curriculum.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { ScoreBar } from "../ds/status.js";
import type { LiveEvent } from "../state/use-interview.js";

function dimensionScore(value: { score: number; notes?: string } | number): { score: number; notes?: string } {
  if (typeof value === "number") return { score: value };
  return { score: value.score, ...(value.notes !== undefined && value.notes !== "" ? { notes: value.notes } : {})};
}

function transcriptHighlights(events: readonly LiveEvent[], limit: number): readonly string[] {
  const out: string[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const event = events[i];
    if (event === undefined) continue;
    if (event.kind === "candidate" || event.kind === "assistant") out.unshift(event.detail);
  }
  return out;
}

export function ResultsScreen({
  backend,
  snapshot,
  events,
  stale = false,
  onHistory,
  onNew,
}: {
  readonly backend: BackendClient;
  readonly snapshot: SerializedStateSnapshot | null;
  readonly events: readonly LiveEvent[];
  /** History detail whose server state could not be re-fetched. */
  readonly stale?: boolean;
  readonly onHistory: () => void;
  readonly onNew: () => void;
}) {
  const [evaluation, setEvaluation] = useState<SerializedEvaluation | null>(null);

  if (snapshot === null) {
    return (
      <div className="screen screen-results">
        <header className="topbar topbar-post">
          <span className="brand">Interview Coach</span>
          <span className="spacer" />
          <GhostButton onClick={onHistory}>Back to History</GhostButton>
        </header>
        <section className="card">
          <h2 className="screen-title">Results</h2>
          <p className="hint">Final state is loading…</p>
        </section>
      </div>
    );
  }

  const shown = evaluation !== null && evaluation.interviewId === snapshot.interview.id
    ? evaluation
    : snapshot.evaluation;
  const topics = snapshot.interview.configuration.topicFocus ?? [];
  const practice = nextPractice({ weaknesses: shown?.weaknesses ?? [], topicFocus: topics });
  const highlights = transcriptHighlights(events, 6);
  const toolTimeline = events.filter((e) => e.kind === "tool" || e.kind === "interview" || e.kind === "connection");

  return (
    <div className="screen screen-results">
      <header className="topbar topbar-post">
        <span className="brand">Interview Coach</span>
        <span className="spacer" />
        <GhostButton onClick={onHistory}>Back to History</GhostButton>
      </header>
      <p className="eyebrow">Debrief · Coaching, not grading</p>
      <h2 className="screen-title">Results — {snapshot.interview.candidateId}</h2>
      {stale && (
        <section className="card state-card state-reconnecting" role="note">
          <p>Saved history entry — live state unavailable. Scores below may be stale.</p>
        </section>
      )}

      <section className="card results-card" aria-label="Scores">
        <h3>
          <span aria-hidden="true">◆</span> Dimension scores{" "}
          <span className="hint-inline">· hints used: {shown?.hintsUsed ?? 0} · responses: {snapshot.responseCount}</span>
        </h3>
        {shown !== null && Object.keys(shown.dimensions).length > 0 ? (
          <div className="score-list">
            {Object.entries(shown.dimensions).map(([name, raw]) => {
              const { score, notes } = dimensionScore(raw);
              return (
                <div key={name} className="score-row">
                  <ScoreBar label={name.replace(/_/g, " ")} value={score} />
                  {notes !== undefined && <p className="hint score-note">{notes}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="hint">No structured evaluation yet — finalize one below.</p>
        )}
        {shown?.overallScore !== undefined && (
          <p className="overall">
            Overall <strong>{shown.overallScore}</strong>
            {shown.recommendation !== undefined && (
              <>
                {" "}· Recommendation <strong>{shown.recommendation.replace(/_/g, " ")}</strong>
              </>
            )}
          </p>
        )}
      </section>

      {shown !== null && (shown.strengths.length > 0 || shown.weaknesses.length > 0) && (
        <div className="results-grid">
          {shown.strengths.length > 0 && (
            <section className="card" aria-label="Strengths">
              <h3>
                <span aria-hidden="true">▲</span> Strengths
              </h3>
              <ul>
                {shown.strengths.map((strength, i) => (
                  <li key={i}>{strength}</li>
                ))}
              </ul>
            </section>
          )}
          {shown.weaknesses.length > 0 && (
            <section className="card" aria-label="Weaknesses">
              <h3>
                <span aria-hidden="true">▼</span> To improve
              </h3>
              <ul>
                {shown.weaknesses.map((weakness, i) => (
                  <li key={i}>{weakness}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <section className="card" aria-label="Interview timeline">
        <h3>
          <span aria-hidden="true">◷</span> Timeline
        </h3>
        {toolTimeline.length === 0 ? (
          <p className="hint">No tool or connection events recorded this session.</p>
        ) : (
          <ul className="event-log">
            {toolTimeline.map((event, i) => (
              <li key={i}>
                <span className="event-kind">{event.kind}</span> {event.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-label="Transcript highlights">
        <h3>
          <span aria-hidden="true">✎</span> Transcript highlights
        </h3>
        {highlights.length === 0 ? (
          <p className="hint">No transcript turns captured — highlights appear here after a voice session.</p>
        ) : (
          <ul className="highlight-list">
            {highlights.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        )}
        <p className="hint">Latest turns, shown verbatim (manual selection — auto-summaries deferred).</p>
      </section>

      <section className="card next-practice" aria-label="Next practice">
        <h3>
          <span aria-hidden="true">►</span> Next practice
        </h3>
        <p>
          <strong>{practice.label}</strong> — {practice.reason}
        </p>
        {practice.sampleProblems.length > 0 && <p className="hint">Try next: {practice.sampleProblems.join(" · ")}</p>}
        <p className="hint">From dsa-interview-curriculum.json (Learn → Practice → Interview Ready → Mastered).</p>
      </section>

      <ExecutionPanel backend={backend} interviewId={snapshot.interview.id} />

      {shown === null && (
        <EvaluationForm backend={backend} interviewId={snapshot.interview.id} onEvaluated={setEvaluation} />
      )}

      <div className="row actions">
        <GhostButton onClick={onHistory}>Back to History</GhostButton>
        <PrimaryButton onClick={onNew}>Start new interview</PrimaryButton>
      </div>
    </div>
  );
}
