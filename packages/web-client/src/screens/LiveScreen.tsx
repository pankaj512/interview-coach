// H-Live (ux-spec §9): the voice-only interview room.
//
// Left: the problem (title, description, sample test case). Right: the code
// editor with a single "Test code" action. Conversation is voice-only — no
// transcript panel and no text composer.

import { useEffect, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { SerializedInterview, SerializedStateSnapshot } from "../api/types.js";
import { CodeWorkspace } from "../components/CodeWorkspace.js";
import { ProblemPanel } from "../components/ProblemPanel.js";
import { DangerButton, GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, Dialog, Wave } from "../ds/primitives.js";
import { StatusChip, Timer, VoiceState } from "../ds/status.js";
import { secondsLeftFor } from "../ds/model.js";
import { formatApiError, useLiveInterview, type LiveEvent } from "../state/use-interview.js";
import type { Interaction, InterviewMode } from "../flow.js";

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
  const [started, setStarted] = useState(false);

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

  const micBlocked = tabHidden;
  const secondsLeft = secondsLeftFor(interview.configuration.durationMinutes, live.elapsedSec);
  const inRoom = live.connection === "connected" || live.connection === "reconnecting" || live.connection === "closed";
  const problem = live.snapshot?.currentProblem ?? null;

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
        {live.snapshot?.interview.status === "completing" && (
          <span className="chip-status chip-connecting" role="status">
            <span className="chip-icon" aria-hidden="true">
              ◌
            </span>
            <span className="chip-label">Wrapping up</span>
          </span>
        )}
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
            <ProblemPanel snapshot={live.snapshot} />
            <CodeWorkspace
              backend={backend}
              interviewId={interview.id}
              problem={problem}
              onActivity={(detail) => {
                live.log("code", detail);
                void live.refresh();
              }}
            />
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
