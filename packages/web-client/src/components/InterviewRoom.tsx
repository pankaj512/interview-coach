// HLD 4.2 — live interview room composition (S4).

import { useState } from "react";
import { BackendClient } from "../api/backend-client.js";
import type { SerializedInterview, SerializedStateSnapshot } from "../api/types.js";
import { useLiveInterview } from "../state/use-interview.js";
import { AnswerForm } from "./AnswerForm.js";
import { CodePanel } from "./CodePanel.js";
import { HintPanel } from "./HintPanel.js";
import { ProblemPanel } from "./ProblemPanel.js";
import { ResultsPanel } from "./ResultsPanel.js";
import { StatusBar } from "./StatusBar.js";

export function InterviewRoom({
  backend,
  interview,
  onExit,
}: {
  backend: BackendClient;
  interview: SerializedInterview;
  onExit: () => void;
}) {
  const live = useLiveInterview(backend, interview);
  const [finalSnapshot, setFinalSnapshot] = useState<SerializedStateSnapshot | null>(null);

  async function handleStart() {
    try {
      await live.start();
    } catch {
      // error surfaces via live.error
    }
  }

  async function handleEnd() {
    const final = await live.finish();
    if (final !== null) setFinalSnapshot(final);
  }

  if (live.finished) {
    return (
      <div className="room">
        <header className="card">
          <h2>Interview complete</h2>
          <p className="hint">Interview {interview.id} · candidate {interview.candidateId}</p>
        </header>
        <ResultsPanel backend={backend} snapshot={finalSnapshot ?? live.snapshot} />
        <button type="button" onClick={onExit}>
          Back to setup
        </button>
      </div>
    );
  }

  return (
    <div className="room">
      <StatusBar
        connection={live.connection}
        assistantSpeaking={live.assistantSpeaking}
        candidateSpeaking={live.candidateSpeaking}
        elapsedSec={live.elapsedSec}
        onEnd={handleEnd}
        busy={live.busy}
      />
      {live.connection === "idle" && (
        <section className="card">
          <h2>Ready — {interview.candidateId}</h2>
          <p className="hint">
            Interview {interview.id} is ready. Joining opens the realtime voice session (the interviewer speaks
            first). The browser connects directly to Voice Live; the backend stays the source of truth.
          </p>
          <button type="button" disabled={live.busy} onClick={handleStart}>
            {live.busy ? "Joining…" : "Join voice interview"}
          </button>
          {live.error !== null && <p className="error">{live.error}</p>}
        </section>
      )}
      {(live.connection === "connecting" || live.connection === "reconnecting") && (
        <section className="card">
          <p>Establishing the realtime session…</p>
        </section>
      )}
      {live.connection === "failed" && (
        <section className="card">
          <p className="error">Could not reach Voice Live. {live.error ?? "Check the backend voice configuration."}</p>
          <div className="row">
            <button type="button" disabled={live.busy} onClick={handleStart}>
              Retry
            </button>
            <button type="button" onClick={onExit}>
              Back to setup
            </button>
          </div>
        </section>
      )}
      {(live.connection === "connected" || live.connection === "closed") && (
        <>
          <div className="grid">
            <ProblemPanel snapshot={live.snapshot} />
            <CodePanel
              backend={backend}
              interviewId={interview.id}
              {...(live.snapshot?.currentProblem == null
                ? {}
                : { problemId: live.snapshot.currentProblem.id })}
              onActivity={(detail) => {
                live.log("code", detail);
                void live.refresh();
              }}
            />
          </div>
          <HintPanel
            backend={backend}
            interviewId={interview.id}
            initialHintsUsed={live.snapshot?.evaluation?.hintsUsed ?? 0}
            onHint={() => void live.refresh()}
          />
          <AnswerForm
            backend={backend}
            interviewId={interview.id}
            onRecorded={() => void live.refresh()}
          />
          <section className="card">
            <h3>Session activity</h3>
            {live.events.length === 0 ? (
              <p className="hint">Tool calls and transcripts will appear here.</p>
            ) : (
              <ul className="event-log">
                {live.events.map((event, i) => (
                  <li key={i}>
                    <span className="event-kind">{event.kind}</span> {event.detail}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {live.connection === "closed" && !live.finished && (
        <section className="card">
          <div className="row">
            <button type="button" disabled={live.busy} onClick={handleStart}>
              Rejoin
            </button>
            <button type="button" disabled={live.busy} onClick={handleEnd}>
              Finish &amp; show results
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
