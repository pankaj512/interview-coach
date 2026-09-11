// H-Live — the room, hero screen (HLD 4.2/4.3/4.4, ux-spec §1/§2/§4/§5).
//
// Locked hierarchy: voice rail → problem panel → editor. The rail wires to
// Voice Live events via useLiveInterview (speech_started/stopped,
// response_created, first audio delta → assistantSpeaking/candidateSpeaking).
// Recovery states (H-Live-states) render inline: reconnecting queues tool
// outputs; tab-hidden is treated as MicBlocked; barge-in is always allowed.
// Guarded end: DangerButton opens the confirm dialog before Completing.
// Editor Submit stays disabled until the Phase 6 sandbox exists.

import { useEffect, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedInterview, SerializedStateSnapshot } from "../api/types.js";
import { AnswerForm } from "../components/AnswerForm.js";
import { CodeEditor } from "../components/CodeEditor.js";
import { HintPanel } from "../components/HintPanel.js";
import { ProblemPanel } from "../components/ProblemPanel.js";
import { DangerButton, GhostButton, PrimaryButton } from "../ds/buttons.js";
import { secondsLeftFor } from "../ds/model.js";
import { Caption, StatusChip, Timer, VoiceState } from "../ds/status.js";
import { formatApiError, useLiveInterview, type LiveEvent } from "../state/use-interview.js";

function captionsFrom(events: readonly LiveEvent[], limit: number): readonly { role: "assistant" | "you"; text: string }[] {
  const captions: { role: "assistant" | "you"; text: string }[] = [];
  for (let i = events.length - 1; i >= 0 && captions.length < limit; i -= 1) {
    const event = events[i];
    if (event === undefined) continue;
    if (event.kind !== "candidate" && event.kind !== "assistant") continue;
    captions.unshift({ role: event.kind === "candidate" ? "you" : "assistant", text: event.detail });
  }
  return captions;
}

export function LiveScreen({
  backend,
  interview,
  onFinished,
  onExit,
}: {
  readonly backend: BackendClient;
  readonly interview: SerializedInterview;
  readonly onFinished: (snapshot: SerializedStateSnapshot | null, events: readonly LiveEvent[]) => void;
  readonly onExit: () => void;
}) {
  const live = useLiveInterview(backend, interview);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Tab-hidden → treat as MicBlocked (H-Live-states): the room waits, no dead end.
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const micBlocked = tabHidden;
  const secondsLeft = secondsLeftFor(interview.configuration.durationMinutes, live.elapsedSec);
  const captions = captionsFrom(live.events, 3);
  const hintsUsed = live.snapshot?.evaluation?.hintsUsed ?? 0;

  async function handleJoin() {
    setJoinError(null);
    try {
      await live.start();
    } catch (e) {
      setJoinError(formatApiError(e));
    }
  }

  async function handleConfirmEnd() {
    setConfirmEnd(false);
    const final = await live.finish();
    onFinished(final, live.events);
  }

  const inRoom = live.connection === "connected" || live.connection === "closed" || live.connection === "reconnecting";

  return (
    <div className="screen screen-live">
      <header className="topbar topbar-live">
        <span className="brand">Interview Coach</span>
        <StatusChip connection={live.connection} micBlocked={micBlocked} />
        <Timer secondsLeft={secondsLeft} elapsedSec={live.elapsedSec} />
        <span className="spacer" />
        <DangerButton onClick={() => setConfirmEnd(true)} disabled={live.busy || !inRoom}>
          End interview
        </DangerButton>
      </header>

      {live.connection === "idle" && (
        <section className="card join-card">
          <h2 className="screen-title">Live room — {interview.candidateId}</h2>
          <p className="lede">
            Interview {interview.id} is ready. Joining opens the realtime voice session (the interviewer speaks
            first). The browser connects directly to Voice Live; the backend stays the source of truth.
          </p>
          <div className="row actions">
            <GhostButton onClick={onExit}>Back to setup</GhostButton>
            <PrimaryButton onClick={handleJoin} disabled={live.busy} autoFocus>
              {live.busy ? "Joining…" : "Join voice interview"}
            </PrimaryButton>
          </div>
          {(live.error ?? joinError) !== null && <p className="error">{live.error ?? joinError}</p>}
        </section>
      )}

      {(live.connection === "connecting" || live.connection === "reconnecting") && !inRoom && (
        <section className="card">
          <p>Establishing the realtime session…</p>
        </section>
      )}

      {live.connection === "failed" && (
        <section className="card">
          <p className="error">Could not reach Voice Live. {live.error ?? joinError ?? "Check the backend voice configuration."}</p>
          <div className="row actions">
            <PrimaryButton onClick={handleJoin} disabled={live.busy}>
              Retry
            </PrimaryButton>
            <GhostButton onClick={onExit}>Back to setup</GhostButton>
          </div>
        </section>
      )}

      {inRoom && (
        <>
          {/* Voice rail (hero): VoiceState + wave + captions. Never unmounts — reflows under 1100px. */}
          <section className="voice-rail" aria-label="Voice activity">
            <div className="rail-status">
              <VoiceState
                assistantSpeaking={live.assistantSpeaking}
                candidateSpeaking={live.candidateSpeaking}
                connection={live.connection}
                micBlocked={micBlocked}
              />
              <div
                className={`wave ${live.assistantSpeaking ? "wave-active" : live.candidateSpeaking ? "wave-live" : "wave-idle"}`}
                aria-hidden="true"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <span key={i} className="wave-bar" style={{ animationDelay: `${(i % 8) * 90}ms` }} />
                ))}
              </div>
            </div>
            <div className="rail-captions">
              {captions.length === 0 ? (
                <p className="hint">Captions stream here — assistant and you. Speak any time; the assistant yields (barge-in).</p>
              ) : (
                captions.map((caption, i) => <Caption key={`${i}-${caption.text.slice(0, 16)}`} role={caption.role} text={caption.text} />)
              )}
            </div>
          </section>

          {live.connection === "reconnecting" && (
            <section className="card state-card state-reconnecting" role="alert">
              <h3>
                <span aria-hidden="true">◌</span> Reconnecting
              </h3>
              <p>Tool outputs queue (bounded 20) and flush on return. Nothing is lost.</p>
            </section>
          )}
          {micBlocked && (
            <section className="card state-card state-micblocked" role="alert">
              <h3>
                <span aria-hidden="true">⌀</span> Mic blocked — room waiting
              </h3>
              <p>This tab is hidden, so it is treated as mic-blocked. Return to this tab to resume speaking.</p>
            </section>
          )}

          {/* Problem → editor (locked order). DOM order = keyboard/focus order (spec §9 Q1). */}
          <div className="live-grid">
            <ProblemPanel snapshot={live.snapshot} />
            <div className="editor-stack">
              <CodeEditor />
              <div className="submit-row">
                <button type="button" className="btn-primary" disabled aria-describedby="submit-note">
                  Submit
                </button>
                <p className="hint" id="submit-note">
                  Submit enables with the Phase 6 sandbox. Today: discuss approach, narrate trade-offs.
                </p>
              </div>
            </div>
          </div>

          <HintPanel
            backend={backend}
            interviewId={interview.id}
            initialHintsUsed={hintsUsed}
            onHint={() => void live.refresh()}
          />
          <AnswerForm backend={backend} interviewId={interview.id} onRecorded={() => void live.refresh()} />

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

          {live.connection === "closed" && (
            <section className="card">
              <div className="row actions">
                <PrimaryButton onClick={handleJoin} disabled={live.busy}>
                  Rejoin
                </PrimaryButton>
                <GhostButton onClick={() => setConfirmEnd(true)} disabled={live.busy}>
                  Finish &amp; show results
                </GhostButton>
              </div>
            </section>
          )}
        </>
      )}

      {confirmEnd && (
        <div className="overlay" role="presentation" onClick={() => setConfirmEnd(false)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="end-title"
            aria-describedby="end-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="end-title">End interview?</h3>
            <p id="end-desc">
              This closes the voice session and moves the interview to Completing. Results stay available
              afterwards. This cannot be undone.
            </p>
            <div className="row actions">
              <GhostButton onClick={() => setConfirmEnd(false)} autoFocus>
                Keep going
              </GhostButton>
              <DangerButton onClick={handleConfirmEnd} disabled={live.busy}>
                {live.busy ? "Ending…" : "End interview"}
              </DangerButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
