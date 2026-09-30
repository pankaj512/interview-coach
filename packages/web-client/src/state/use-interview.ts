// @interview-coach/web-client - interview lifecycle hooks.
//
// UI state only. Authoritative state lives in the backend; these hooks poll
// `GET .../state` for display and drive transitions through the control-plane
// client. Voice media stays in VoiceInterviewClient (media plane, frozen
// section 2).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackendApiError, BackendClient } from "../api/backend-client.js";
import type {
  InterviewStatus,
  SerializedInterview,
  SerializedStateSnapshot,
  ToolName,
  VoiceSessionPayload,
} from "../api/types.js";
import { loadWebConfig } from "../config.js";
import { useAuthSession } from "./auth-store.js";
import { createBrowserMicCapture, createBrowserPlayback } from "../voice/browser-audio.js";
import { buildResumeHistory, resolveCandidateCode, type LiveCodeReader } from "../voice/session.js";
import { VoiceInterviewClient, type VoiceConnectionState, type VoiceWebSocket } from "../voice/voice-client.js";

export function useBackendClient(): BackendClient {
  // S8c: the account session token (when signed in) beats the static
  // local-dev VITE_API_TOKEN; every screen rebuilds its client on change.
  const session = useAuthSession();
  return useMemo(() => {
    const config = loadWebConfig();
    const token = session?.token ?? config.apiToken;
    return new BackendClient(config.backendUrl, undefined, {
      ...(token === undefined ? {} : { authToken: token }),
    });
  }, [session?.token]);
}

export function formatApiError(error: unknown): string {
  // Already-formatted strings pass through (guards against double-formatting,
  // which previously masked every error as "Unexpected error").
  if (typeof error === "string") return error;
  if (error instanceof BackendApiError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Unexpected error";
}

export interface LiveEvent {
  readonly at: string;
  readonly kind: string;
  readonly detail: string;
}

/** Delay after the snapshot reaches "completing" before the client
 *  auto-finishes: covers end_interview tool-call latency now that the
 *  model's goodbye precedes the call. Manual End stays immediate. */
export const AUTO_FINISH_DELAY_MS = 2000;

/** Derive whether the client should schedule its once-only auto-finish:
 *  only from a fresh "completing" snapshot, never after a manual finish
 *  and never twice. Pure for unit tests; the hook owns the timer. */
export function shouldAutoFinish(
  status: InterviewStatus | null | undefined,
  finished: boolean,
  scheduled: boolean,
): boolean {
  return status === "completing" && !finished && !scheduled;
}

/** Derive whether a "closed" socket needs one fresh snapshot: only an
 *  unexpected post-join drop with no finish in flight. The snapshot poll
 *  runs while connected, so without this a socket that closes right after
 *  the model ends the interview strands the room on "Session closed".
 *  Pure for unit tests; the hook owns the refresh. */
export function shouldRefreshOnClose(
  connection: VoiceConnectionState,
  hasJoined: boolean,
  finished: boolean,
  scheduled: boolean,
  suspending: boolean,
): boolean {
  return connection === "closed" && hasJoined && !finished && !scheduled && !suspending;
}

// HLD 4.2: realtime interview screen state - connection, speakers, timer,
// polled backend snapshot, tool/transcript activity, plus the S6.1 mute/pause
// controls and the text-fallback path.
export interface UseLiveInterviewOptions {
  // Live editor reader for get_candidate_code: answered locally in the
  // browser, never forwarded to tool-exec. Absent (e.g. no editor mounted)
  // yields a permanent model-facing failure, not a retry.
  readonly codeReader?: LiveCodeReader;
}

export function useLiveInterview(
  backend: BackendClient,
  interview: SerializedInterview,
  options?: UseLiveInterviewOptions,
) {
  const [connection, setConnection] = useState<VoiceConnectionState>("idle");
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<SerializedStateSnapshot | null>(null);
  const [events, setEvents] = useState<readonly LiveEvent[]>([]);
  // Ref mirror of the transcript feed: resumeVoice reads the pre-pause turns
  // at click time, outside the render that captured its callback.
  const eventsRef = useRef<readonly LiveEvent[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveStarted, setLiveStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const clientRef = useRef<VoiceInterviewClient | null>(null);
  // Wall-clock start of the interview (audit C4-5): the elapsed timer must
  // keep counting across reconnect/mic-blocked windows, not freeze when the
  // connection state changes. An explicit pause is the one exception: while
  // paused the timer holds and resume shifts this base forward.
  const startedAtRef = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);
  // Deliberate pause-suspend in progress: the voice client's "closed" state
  // must not drop the client reference, resume reconnects the same client.
  const suspendingRef = useRef(false);
  // First successful join: a pre-join "closed" (StrictMode remount cleanup,
  // or any remount before the first connect) must render the join card, not
  // the room. Set once on the first "connected"; never reset for the life
  // of this screen instance (pause-suspend reports "closed" post-join and
  // must keep the room).
  const joinedRef = useRef(false);
  // Wall-clock instant the explicit pause began; resume shifts the timer base
  // forward so the elapsed clock freezes while paused.
  const pausedAtRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  // Latest hook options for callbacks created once (start/toolExecutor):
  // the live editor reader must stay fresh without re-creating them.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const log = useCallback((kind: string, detail: string) => {
    const entry: LiveEvent = { at: new Date().toISOString(), kind, detail };
    setEvents((prev) => [...prev.slice(-199), entry]);
    eventsRef.current = [...eventsRef.current.slice(-199), entry];
  }, []);

  const refreshSnapshot = useCallback(async (): Promise<SerializedStateSnapshot | null> => {
    try {
      const snap = await backend.getState(interview.id);
      setSnapshot(snap);
      return snap;
    } catch {
      // Display-only poll: keep the call alive on transient failures.
      return null;
    }
  }, [backend, interview.id]);

  const start = useCallback(async () => {
    if (clientRef.current !== null || startingRef.current) return;
    startingRef.current = true;
    setBusy(true);
    setError(null);
    setMuted(false);
    mutedRef.current = false;
    try {
      const session: VoiceSessionPayload = await backend.createVoiceSession(interview.id);
      const mic = await createBrowserMicCapture((chunk) => {
        if (mutedRef.current || pausedRef.current) return;
        clientRef.current?.sendMicAudio(chunk);
      });
      const client = new VoiceInterviewClient(
        {
          wsFactory: (url) => new WebSocket(url) as unknown as VoiceWebSocket,
          mic,
          playback: createBrowserPlayback(),
          toolExecutor: (callId, tool: ToolName, signal, args) => {
            if (tool === "get_candidate_code") {
              return Promise.resolve(resolveCandidateCode(callId, optionsRef.current?.codeReader));
            }
            return backend.toolExec(interview.id, callId, tool, signal, args);
          },
          storage: sessionStorage,
        },
        {
          onConnectionState: (state) => {
            setConnection(state);
            if (state === "connected") {
              joinedRef.current = true;
              if (startedAtRef.current === null) startedAtRef.current = Date.now();
              setLiveStarted(true);
            }
            // Unexpected close: release the mic and clear the client so the
            // room's Rejoin can mint a fresh session (C4-1). The elapsed
            // clock keeps its original start (C4-5). A deliberate
            // pause-suspend reports "closed" too: keep the client so resume
            // reconnects it (disconnect already stopped mic and playback).
            if (state === "closed") {
              if (suspendingRef.current) return;
              const dropped = clientRef.current;
              clientRef.current = null;
              if (dropped !== null) void dropped.disconnect().catch(() => undefined);
            }
          },
          onAssistantSpeaking: setAssistantSpeaking,
          onCandidateSpeaking: setCandidateSpeaking,
          onToolStart: (callId, tool) => log("tool", `${tool} started (${callId.slice(0, 8)}...)`),
          onToolComplete: (callId, tool, elapsedMs, replayed) =>
            log("tool", `${tool} complete in ${elapsedMs}ms${replayed ? " (replayed)" : ""}`),
          onTranscript: (text) => {
            log("candidate", text);
            // Phase 9: forward the final turn to the backend transcript
            // (best-effort; the interview itself is unaffected on failure).
            void backend
              .appendTranscript(interview.id, [{ role: "candidate", content: text }])
              .catch(() => undefined);
          },
          onAssistantTranscript: (text) => {
            log("assistant", text);
            void backend
              .appendTranscript(interview.id, [{ role: "interviewer", content: text }])
              .catch(() => undefined);
          },
          onMetric: (event, fields) => {
            if (event === "voice.error" || event === "voice.closed_unexpectedly") {
              log("connection", `${event} ${JSON.stringify(fields ?? {})}`);
            }
          },
          onError: (e) => {
            setError(formatApiError(e));
            log("connection", `error: ${formatApiError(e)}`);
          },
        },
      );
      clientRef.current = client;
      await client.recoverPendingOutputs(backend, interview.id, sessionStorage);
      await client.connect(interview.id, session);
      await refreshSnapshot();
    } catch (e) {
      clientRef.current = null;
      setError(formatApiError(e));
      throw e;
    } finally {
      startingRef.current = false;
      setBusy(false);
    }
  }, [backend, interview.id, log, refreshSnapshot]);

  const hangup = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    startedAtRef.current = null;
    setLiveStarted(false);
    setAssistantSpeaking(false);
    setCandidateSpeaking(false);
    if (client !== null) {
      await client.disconnect().catch(() => undefined);
    }
    // Release the server-side session record (S3 activeVoiceSessions).
    await backend.deleteVoiceSession(interview.id).catch(() => undefined);
    setConnection("closed");
  }, [backend, interview.id]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      return next;
    });
  }, []);

  // Suspend the media plane for an explicit pause (hook-level only; the
  // frozen media plane is untouched). Stops mic capture and playback and
  // closes the Azure socket so a paused interview holds no live session.
  // Keeps the client so resume reconnects it with the still-valid mint.
  const suspendVoice = useCallback(async () => {
    const client = clientRef.current;
    if (client === null) return;
    suspendingRef.current = true;
    try {
      await client.disconnect("paused");
    } finally {
      suspendingRef.current = false;
    }
  }, []);

  // Reconnect a pause-suspended client. Drops the client when the session is
  // dead so the join card's Retry can mint a fresh one instead of trapping
  // the room on a failed voice state. Replays the pre-pause turns so the
  // interviewer continues the thread; empty history keeps the plain greeting.
  const resumeVoice = useCallback(async () => {
    const client = clientRef.current;
    if (client === null) return;
    const history = buildResumeHistory(eventsRef.current);
    try {
      if (!(await client.reconnect(history.length > 0 ? history : undefined))) {
        clientRef.current = null;
        setError("Voice session expired. Rejoin to continue speaking.");
      }
    } catch (e) {
      clientRef.current = null;
      setError(formatApiError(e));
    }
  }, []);

  const togglePause = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Act on a fresh snapshot: the interview may have drifted (e.g. the
      // model ended it) since the last display poll. The backend stays
      // authoritative; this only avoids firing requests that must fail.
      const snap = await refreshSnapshot();
      const status = snap?.interview.status;
      if (pausedRef.current) {
        // Resume is legal only from paused; an already-resumed backend just
        // needs the local flags and media resynced.
        if (status !== undefined && status !== "paused" && status !== "in_progress") {
          setError(`Cannot resume while the interview is ${status}.`);
          return;
        }
        if (status === undefined || status === "paused") {
          await backend.resumeInterview(interview.id);
        }
        await resumeVoice();
        const pausedAt = pausedAtRef.current;
        if (pausedAt !== null && startedAtRef.current !== null) {
          startedAtRef.current += Date.now() - pausedAt;
        }
        pausedAtRef.current = null;
        setPaused(false);
        pausedRef.current = false;
        log("interview", "resumed");
      } else {
        if (status !== undefined && status !== "in_progress") {
          setError(`Cannot pause while the interview is ${status}.`);
          return;
        }
        await backend.pauseInterview(interview.id);
        pausedAtRef.current = Date.now();
        await suspendVoice();
        setPaused(true);
        pausedRef.current = true;
        log("interview", "paused");
      }
      await refreshSnapshot();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }, [backend, interview.id, log, refreshSnapshot, resumeVoice, suspendVoice]);

  // Text fallback (spec §16): send a typed turn to Voice Live as an
  // input_text user message and let the interviewer respond. Also persisted
  // backend-side so evaluation sees the turn.
  const sendText = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (trimmed === "") return false;
      const client = clientRef.current;
      const sent = client !== null && client.sendTextMessage(trimmed);
      log("candidate", trimmed);
      try {
        await backend.recordResponse(interview.id, { kind: "answer", content: trimmed });
      } catch {
        // The voice turn is the priority; persistence is best-effort here.
      }
      return sent;
    },
    [backend, interview.id, log],
  );

  // Fix B push: best-effort verdict summary into the live session. False
  // (not connected) is a normal outcome the caller ignores.
  const pushVerdictSummary = useCallback((summary: string): boolean => {
    const client = clientRef.current;
    return client !== null && client.notifySubmission(summary);
  }, []);

  const finish = useCallback(async (): Promise<SerializedStateSnapshot | null> => {
    setBusy(true);
    try {
      await hangup();
      // App-only finalization (in_progress/paused/completing -> completed).
      const { interview: done } = await backend.endInterview(interview.id);
      log("interview", `ended (${done.status})`);
      const final = await backend.getState(interview.id).catch(() => null);
      setSnapshot(final);
      setFinished(true);
      return final;
    } catch (e) {
      setError(formatApiError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [backend, hangup, interview.id, log]);

  // Fix A: the model ends the interview by calling end_interview (goodbye
  // already said), which lands the backend in "completing" with the socket
  // still open. Finish once from the client after a short beat so the room
  // does not strand on "Wrapping up". A manual End during the beat flips
  // finished and clears the timer via cleanup; the ref guards re-renders.
  const autoFinishRef = useRef(false);
  useEffect(() => {
    if (!shouldAutoFinish(snapshot?.interview.status, finished, autoFinishRef.current)) return;
    autoFinishRef.current = true;
    log("interview", "model ended the interview - auto-finishing");
    const timer = setTimeout(() => {
      void finish();
    }, AUTO_FINISH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [snapshot, finished, finish, log]);

  // Model-end drop: refresh once on an unexpected post-join close so the
  // auto-finish effect above can observe "completing" and schedule finish().
  // A blip during another status refreshes to that status, stays quiet, and
  // keeps today's Rejoin path; a failed refresh returns null and no-ops.
  useEffect(() => {
    if (
      !shouldRefreshOnClose(
        connection,
        joinedRef.current,
        finished,
        autoFinishRef.current,
        suspendingRef.current,
      )
    ) {
      return;
    }
    void refreshSnapshot();
  }, [connection, finished, refreshSnapshot]);

  // Release the session when the room unmounts (navigation, tab close).
  const hangupRef = useRef(hangup);
  hangupRef.current = hangup;
  useEffect(() => () => {
    void hangupRef.current();
  }, []);

  // C4-3: best-effort session release on tab close/navigate-away, so an
  // abandoned tab does not leak an activeVoiceSessions slot until the TTL
  // sweep (V3-1). `pagehide` is the reliable cross-browser unload signal.
  useEffect(() => {
    const onPageHide = () => {
      void backend.deleteVoiceSession(interview.id).catch(() => undefined);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [backend, interview.id]);

  // Elapsed timer: ticks while the interview is live, independent of the
  // connection state, so it does not freeze across reconnect/mic-blocked.
  // An explicit pause holds the clock; resume shifts the base forward.
  useEffect(() => {
    if (!liveStarted) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const since = startedAtRef.current;
      setElapsedSec(since === null ? 0 : Math.floor((Date.now() - since) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [liveStarted]);

  // Display snapshot poll (canonical problem display + progress).
  useEffect(() => {
    if (connection !== "connected") return;
    const timer = setInterval(() => {
      void refreshSnapshot();
    }, 5000);
    return () => clearInterval(timer);
  }, [connection, refreshSnapshot]);

  // Initial snapshot for the live screen header.
  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  return {
    connection,
    hasJoined: joinedRef.current,
    assistantSpeaking,
    candidateSpeaking,
    muted,
    paused,
    snapshot,
    events,
    elapsedSec,
    busy,
    error,
    finished,
    start,
    hangup,
    finish,
    toggleMute,
    togglePause,
    sendText,
    pushVerdictSummary,
    refresh: refreshSnapshot,
    log,
    clearError: () => setError(null),
  };
}
