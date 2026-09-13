// H-Live (ux-spec §9–§19): the interview room — conversation-first, with an
// interview-progress checklist, problem + code workspace, optional coaching,
// a text fallback composer, and the mute/pause/end control bar.

import { useEffect, useMemo, useRef, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedInterview, SerializedStateSnapshot } from "../api/types.js";
import { CodePanel } from "../components/CodePanel.js";
import { HintPanel } from "../components/HintPanel.js";
import { ProblemPanel } from "../components/ProblemPanel.js";
import { DangerButton, GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, Dialog, ProgressChecklist, Wave, type ProgressState } from "../ds/primitives.js";
import { StatusChip, Timer, VoiceState } from "../ds/status.js";
import { secondsLeftFor } from "../ds/model.js";
import { formatApiError, useLiveInterview, type LiveEvent } from "../state/use-interview.js";
import type { Interaction, InterviewMode } from "./SetupScreen.js";

interface Turn {
  readonly role: "assistant" | "you";
  readonly text: string;
}

function turnsFrom(events: readonly LiveEvent[]): readonly Turn[] {
  const turns: Turn[] = [];
  for (const event of events) {
    if (event.kind === "assistant") turns.push({ role: "assistant", text: event.detail });
    else if (event.kind === "candidate") turns.push({ role: "you", text: event.detail });
  }
  return turns;
}

function progressFrom(
  interview: SerializedInterview,
  snapshot: SerializedStateSnapshot | null,
): readonly { label: string; state: ProgressState }[] {
  const current = snapshot?.interview.currentOrder ?? interview.currentOrder;
  const problems = interview.problems;
  if (problems.length === 0) {
    return [
      { label: "Clarify the problem", state: "active" },
      { label: "Discuss approach", state: "todo" },
      { label: "Implement", state: "todo" },
      { label: "Test & complexity", state: "todo" },
    ];
  }
  return problems.map((p, i) => {
    const state: ProgressState = current === null ? (i === 0 ? "active" : "todo") : i < current ? "done" : i === current ? "active" : "todo";
    const label = i === current && snapshot?.currentProblem !== null && snapshot?.currentProblem !== undefined
      ? snapshot.currentProblem.title
      : `Problem ${i + 1}`;
    return { label, state };
  });
}

export function LiveScreen({
  backend,
  interview,
  mode,
  interaction,
  onFinished,
  onExit,
}: {
  readonly backend: BackendClient;
  readonly interview: SerializedInterview;
  readonly mode: InterviewMode;
  readonly interaction: Interaction;
  readonly onFinished: (
    snapshot: SerializedStateSnapshot | null,
    events: readonly LiveEvent[],
    elapsedSec: number,
  ) => void;
  readonly onExit: () => void;
}) {
  const live = useLiveInterview(backend, interview);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [started, setStarted] = useState(false);
  const conversationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (started) return;
    setStarted(true);
    void handleJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turns = useMemo(() => turnsFrom(live.events), [live.events]);
  useEffect(() => {
    const el = conversationRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  const micBlocked = tabHidden;
  const secondsLeft = secondsLeftFor(interview.configuration.durationMinutes, live.elapsedSec);
  const progress = progressFrom(interview, live.snapshot);
  const hintsUsed = live.snapshot?.evaluation?.hintsUsed ?? 0;
  const inRoom = live.connection === "connected" || live.connection === "reconnecting" || live.connection === "closed";

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
    onFinished(final, live.events, live.elapsedSec);
  }

  async function submitDraft(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (text === "") return;
    setDraft("");
    await live.sendText(text);
  }

  const statusChip = micBlocked ? (
    <StatusChip connection={live.connection} micBlocked />
  ) : (
    <StatusChip connection={live.connection} />
  );

  return (
    <div className="room">
      <header className="room-topbar">
        <div className="room-title">
          <strong>
            {interview.configuration.interviewType === "dsa" ? "Coding" : interview.configuration.interviewType} Interview ·{" "}
            {interview.configuration.difficulty ?? "Medium"}
          </strong>
          <span className="hint">
            {mode} · {interaction}
          </span>
        </div>
        <Timer secondsLeft={secondsLeft} elapsedSec={live.elapsedSec} />
        {statusChip}
        <span className="spacer" />
        <DangerButton onClick={() => setConfirmEnd(true)} disabled={live.busy || !inRoom}>
          End interview
        </DangerButton>
      </header>

      {!inRoom && (
        <Card className="join-card">
          <h1 className="page-title">Joining the interview…</h1>
          <p className="lede">
            {live.connection === "failed"
              ? live.error ?? joinError ?? "Could not reach the interviewer."
              : "Connecting to the interviewer. The interviewer speaks first."}
          </p>
          {live.connection === "failed" && (
            <div className="row actions">
              <PrimaryButton onClick={handleJoin} disabled={live.busy}>
                Retry
              </PrimaryButton>
              <GhostButton onClick={onExit}>Back to dashboard</GhostButton>
            </div>
          )}
        </Card>
      )}

      {inRoom && (
        <>
          {(live.connection === "reconnecting" || micBlocked || live.paused) && (
            <div className="state-strip">
              {live.connection === "reconnecting" && (
                <Card className="state-card state-reconnecting" role="alert">
                  <strong>◌ Reconnecting</strong>
                  <span className="hint">Tool outputs queue and flush on return. Nothing is lost.</span>
                </Card>
              )}
              {micBlocked && (
                <Card className="state-card state-micblocked" role="alert">
                  <strong>⌀ Mic blocked — room waiting</strong>
                  <span className="hint">This tab is hidden. Return to this tab to resume speaking.</span>
                </Card>
              )}
              {live.paused && (
                <Card className="state-card state-paused" role="alert">
                  <strong>Ⅱ Interview paused</strong>
                  <span className="hint">Mic suspended. Resume when ready.</span>
                </Card>
              )}
            </div>
          )}

          <div className="room-grid">
            <Card className="conversation-card">
              <div className="conversation-head">
                <h3 className="section-title">Conversation</h3>
                <span className="hint">Interviewer speaks first · auto-scroll</span>
              </div>
              <div className="conversation" ref={conversationRef} aria-live="polite">
                {turns.length === 0 ? (
                  <p className="hint">The conversation will appear here. Speak any time — the interviewer yields (barge-in).</p>
                ) : (
                  turns.map((turn, i) => (
                    <div key={i} className={`turn turn-${turn.role} ${i === turns.length - 1 ? "turn-latest" : ""}`}>
                      <span className="turn-role">{turn.role === "assistant" ? "Interviewer" : "You"}</span>
                      <p className="turn-text">{turn.text}</p>
                    </div>
                  ))
                )}
              </div>
              <form className="composer" onSubmit={submitDraft}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type your response… (text fallback — interview state unchanged)"
                  aria-label="Type your response"
                />
                <PrimaryButton type="submit" disabled={draft.trim() === ""}>
                  Send
                </PrimaryButton>
              </form>
            </Card>

            <div className="room-side">
              <Card>
                <h3 className="section-title">Interview Progress</h3>
                <p className="hint">Session progress, not hidden criteria.</p>
                <ProgressChecklist items={progress} />
              </Card>
              <ProblemPanel snapshot={live.snapshot} />
              <CodePanel
                backend={backend}
                interviewId={interview.id}
                {...(live.snapshot?.currentProblem == null ? {} : { problemId: live.snapshot.currentProblem.id })}
                onActivity={(detail) => {
                  live.log("code", detail);
                  void live.refresh();
                }}
              />
              {mode === "Guided Coaching" && (
                <HintPanel
                  backend={backend}
                  interviewId={interview.id}
                  initialHintsUsed={hintsUsed}
                  onHint={() => void live.refresh()}
                />
              )}
              {showActivity && (
                <Card>
                  <h3 className="section-title">Session activity</h3>
                  <ul className="event-log">
                    {live.events.map((event, i) => (
                      <li key={i}>
                        <span className="event-kind">{event.kind}</span> {event.detail}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>

          <div className="control-bar">
            <div className="control-voice">
              <Wave active={live.assistantSpeaking} live={live.candidateSpeaking} />
              <VoiceState
                assistantSpeaking={live.assistantSpeaking}
                candidateSpeaking={live.candidateSpeaking}
                connection={live.connection}
                micBlocked={micBlocked}
                muted={live.muted}
                paused={live.paused}
              />
            </div>
            <div className="control-actions">
              <GhostButton onClick={live.toggleMute} disabled={live.paused}>
                {live.muted ? "Unmute" : "Mute"}
              </GhostButton>
              <GhostButton onClick={() => void live.togglePause()} disabled={live.busy}>
                {live.paused ? "Resume" : "Pause"}
              </GhostButton>
              <GhostButton onClick={() => setShowActivity((v) => !v)}>
                {showActivity ? "Hide transcript" : "Transcript"}
              </GhostButton>
              <DangerButton onClick={() => setConfirmEnd(true)} disabled={live.busy}>
                End interview
              </DangerButton>
            </div>
          </div>
        </>
      )}

      {confirmEnd && (
        <Dialog
          title="End interview?"
          onClose={() => setConfirmEnd(false)}
          actions={
            <>
              <GhostButton onClick={() => setConfirmEnd(false)}>Continue Interview</GhostButton>
              <DangerButton onClick={handleConfirmEnd} disabled={live.busy}>
                {live.busy ? "Ending…" : "End & Evaluate"}
              </DangerButton>
            </>
          }
        >
          <p>Your interview is currently {Math.max(1, Math.round(live.elapsedSec / 60))} minutes long.</p>
          <p>You can finish now and receive your evaluation.</p>
        </Dialog>
      )}
    </div>
  );
}
