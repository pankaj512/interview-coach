// H-Live (feature 17b): the voice-only interview room on the approved
// prototype look. Left: the problem (title + sample test case, title-only
// until item 18). Right: the code editor with a single "Test sample cases"
// action.
// Conversation is voice-only — no transcript panel and no text composer.
// All session logic, hooks, and tool wiring preserved.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { Problem, ProblemContent, SerializedInterview, SerializedStateSnapshot } from "../api/types.js";
import { CodeWorkspace } from "../components/CodeWorkspace.js";
import { ProblemPanel } from "../components/ProblemPanel.js";
import { DangerButton, GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, Dialog, VoiceRail, Wave } from "../ds/primitives.js";
import { StatusChip, Timer, VoiceState } from "../ds/status.js";
import { secondsLeftFor } from "../ds/model.js";
import { formatApiError, useLiveInterview, type LiveEvent } from "../state/use-interview.js";
import type { Interaction, InterviewMode } from "../flow.js";

/** Minimum width in px of each room pane while dragging the split. Below
 *  this the narrow pane would clip the editor gutter or the problem table. */
export const SPLIT_PANE_MIN = 300;

/** Clamp a dragged editor-fraction into the per-pane minimums of `width`. */
export function clampSplitPct(rawPct: number, width: number, paneMin: number = SPLIT_PANE_MIN): number {
  const minPct = Math.min(50, (paneMin / Math.max(width, 1)) * 100);
  return Math.min(Math.max(rawPct, minPct), 100 - minPct);
}

export function LiveScreen({
  backend,
  interview,
  mode,
  interaction,
  problem: fallbackProblem = null,
  onFinished,
  onExit,
}: {
  readonly backend: BackendClient;
  readonly interview: SerializedInterview;
  readonly mode: InterviewMode;
  readonly interaction: Interaction;
  /** Phase 7: the recommendation-driven problem from the Lobby, displayed
   *  immediately while the first state snapshot is still loading. */
  readonly problem?: Problem | null;
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
  const problem = live.snapshot?.currentProblem ?? fallbackProblem ?? null;
  // 18c content slice for the pane + editor prefill. `undefined` = loading,
  // `null` = no problem or fetch failed (panels fall back to snapshot fields),
  // object = ready (null fields inside mark a title-only gap problem).
  const [content, setContent] = useState<ProblemContent | null | undefined>(undefined);
  useEffect(() => {
    if (problem === null) {
      setContent(undefined);
      return;
    }
    let cancelled = false;
    setContent(undefined);
    void backend
      .getProblemContent(problem.id)
      .then((loaded) => {
        if (!cancelled) setContent(loaded);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [backend, problem?.id]);
  const interviewKind = interview.configuration.interviewType === "dsa" ? "DSA" : interview.configuration.interviewType;

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
  const transcriptTurns = live.events.filter((e) => e.kind === "assistant" || e.kind === "candidate").slice(-6);
  const transcriptRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const list = transcriptRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [live.events]);

  // Draggable problem/editor split: editor width as a flex-basis percent,
  // session-only (resets on reload). The divider supports pointer drag and
  // arrow keys; narrow screens stack and hide it (styles.css).
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [splitPct, setSplitPct] = useState(55);
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);
  // Window-level move/up listeners (mounted once) read the live dragRef,
  // so a drag started on the divider is tracked even off-element.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const grid = gridRef.current;
      if (drag === null || grid === null) return;
      const rect = grid.getBoundingClientRect();
      const dxPct = ((e.clientX - drag.startX) / Math.max(rect.width, 1)) * 100;
      setSplitPct(clampSplitPct(drag.startPct - dxPct, rect.width));
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
  const gridStyle = { "--editor-pct": `${splitPct}%` } as CSSProperties;

  return (
    <div className="room">
      <header className="live-topbar">
        <span className="brand">Interview Coach</span>
        <h1>
          {interviewKind} Interview · {interview.configuration.difficulty ?? "Medium"}
        </h1>
        <Timer secondsLeft={secondsLeft} elapsedSec={live.elapsedSec} />
        {statusChip}
        {live.snapshot?.interview.status === "completing" && (
          <span className="live-badge" role="status">
            Wrapping up
          </span>
        )}
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
          {(live.connection === "reconnecting" || micBlocked) && (
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
            </div>
          )}

          <div className="rail">
            <VoiceRail
              state={
                <VoiceState
                  assistantSpeaking={live.assistantSpeaking}
                  candidateSpeaking={live.candidateSpeaking}
                  connection={live.connection}
                  micBlocked={micBlocked}
                  muted={live.muted}
                  paused={live.paused}
                />
              }
              waveform={<Wave active={live.assistantSpeaking} live={live.candidateSpeaking} />}
              controls={
                <>
                  <GhostButton onClick={live.toggleMute} disabled={live.paused}>
                    {live.muted ? "Unmute" : "Mute"}
                  </GhostButton>
                  <GhostButton onClick={() => void live.togglePause()} disabled={live.busy}>
                    {live.paused ? "Resume" : "Pause"}
                  </GhostButton>
                  <DangerButton onClick={() => setConfirmEnd(true)} disabled={live.busy}>
                    End interview
                  </DangerButton>
                </>
              }
            />
          </div>

          <div className="live-grid" ref={gridRef} style={gridStyle}>
            <div className="live-column">
              <ProblemPanel snapshot={live.snapshot} fallbackProblem={fallbackProblem} content={content} />
              {transcriptTurns.length > 0 && (
                <Card>
                  <h3 className="section-title">Conversation</h3>
                  <ol className="transcript-list" aria-live="polite" ref={transcriptRef}>
                    {transcriptTurns.map((turn, i) => (
                      <li key={`${turn.at}-${i}`} className="turn">
                        <span className="turn-role">
                          {turn.kind === "assistant" ? "Interviewer" : "You"}
                        </span>
                        <p className="turn-text">{turn.detail}</p>
                      </li>
                    ))}
                  </ol>
                </Card>
              )}
            </div>
            <div
              className="split-divider"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize problem and editor panes"
              aria-valuenow={Math.round(splitPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragRef.current = { startX: e.clientX, startPct: splitPct };
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  const width = gridRef.current?.getBoundingClientRect().width ?? 0;
                  if (width <= 0) return;
                  setSplitPct((pct) =>
                    clampSplitPct(pct + (e.key === "ArrowRight" ? -2 : 2), width),
                  );
                }
              }}
            />
            <CodeWorkspace
              backend={backend}
              interviewId={interview.id}
              problem={problem}
              starters={content?.starters ?? null}
              onActivity={(detail) => {
                live.log("code", detail);
                void live.refresh();
              }}
            />
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
