// @interview-coach/web-client — interview lifecycle hooks.
//
// UI state only. Authoritative state lives in the backend; these hooks poll
// `GET .../state` for display and drive transitions through the control-plane
// client. Voice media stays in VoiceInterviewClient (media plane, frozen
// section 2).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackendApiError, BackendClient } from "../api/backend-client.js";
import type {
  InterviewConfiguration,
  SerializedInterview,
  SerializedStateSnapshot,
  ToolName,
  VoiceSessionPayload,
} from "../api/types.js";
import { loadWebConfig } from "../config.js";
import { useAuthSession } from "./auth-store.js";
import { createBrowserMicCapture, createBrowserPlayback } from "../voice/browser-audio.js";
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
  if (error instanceof BackendApiError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Unexpected error";
}

export interface SetupInput {
  readonly candidateId: string;
  readonly configuration: InterviewConfiguration;
  readonly problemIds: readonly string[];
  /** S5: deterministic backend auto-select instead of manual ids. */
  readonly autoSelect: boolean;
}

// HLD 4.1: interview setup — create -> attach problems (manual ids or S5
// backend auto-select from the configuration) -> ready. The voice session
// mint (start) happens on the live screen, which auto-starts a ready
// interview server-side (S3).
export function useInterviewSetup(backend: BackendClient) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setup = useCallback(
    async (input: SetupInput): Promise<SerializedInterview> => {
      setBusy(true);
      setError(null);
      try {
        const interview = await backend.createInterview({
          candidateId: input.candidateId,
          configuration: input.configuration,
        });
        if (input.autoSelect) {
          const selected = await backend.selectProblems(interview.id, {});
          return await backend.markReady(selected.id);
        }
        if (input.problemIds.length > 0) {
          return await backend.markReady(
            (await backend.assignProblems(interview.id, input.problemIds)).id,
          );
        }
        return await backend.markReady(interview.id);
      } catch (e) {
        setError(formatApiError(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [backend],
  );

  return { setup, busy, error, clearError: () => setError(null) };
}

export interface LiveEvent {
  readonly at: string;
  readonly kind: string;
  readonly detail: string;
}

// HLD 4.2: realtime interview screen state — connection, speakers, timer,
// polled backend snapshot, tool/transcript activity, plus the S6.1 mute/pause
// controls and the text-fallback path.
export function useLiveInterview(backend: BackendClient, interview: SerializedInterview) {
  const [connection, setConnection] = useState<VoiceConnectionState>("idle");
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<SerializedStateSnapshot | null>(null);
  const [events, setEvents] = useState<readonly LiveEvent[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveStarted, setLiveStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const clientRef = useRef<VoiceInterviewClient | null>(null);
  // Wall-clock start of the interview (audit C4-5): the elapsed timer must
  // keep counting across reconnect/mic-blocked windows, not freeze when the
  // connection state changes.
  const startedAtRef = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);
  const startingRef = useRef(false);

  const log = useCallback((kind: string, detail: string) => {
    const entry: LiveEvent = { at: new Date().toISOString(), kind, detail };
    setEvents((prev) => [...prev.slice(-199), entry]);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    try {
      setSnapshot(await backend.getState(interview.id));
    } catch {
      // Display-only poll: keep the call alive on transient failures.
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
          toolExecutor: (callId, tool: ToolName, signal, args) =>
            backend.toolExec(interview.id, callId, tool, signal, args),
          storage: sessionStorage,
        },
        {
          onConnectionState: (state) => {
            setConnection(state);
            if (state === "connected") {
              if (startedAtRef.current === null) startedAtRef.current = Date.now();
              setLiveStarted(true);
            }
            // Unexpected close: release the mic and clear the client so the
            // room's Rejoin can mint a fresh session (C4-1). The elapsed
            // clock keeps its original start (C4-5).
            if (state === "closed") {
              const dropped = clientRef.current;
              clientRef.current = null;
              if (dropped !== null) void dropped.disconnect().catch(() => undefined);
            }
          },
          onAssistantSpeaking: setAssistantSpeaking,
          onCandidateSpeaking: setCandidateSpeaking,
          onToolStart: (callId, tool) => log("tool", `${tool} started (${callId.slice(0, 8)}…)`),
          onToolComplete: (callId, tool, elapsedMs, replayed) =>
            log("tool", `${tool} complete in ${elapsedMs}ms${replayed ? " (replayed)" : ""}`),
          onTranscript: (text) => log("candidate", text),
          onAssistantTranscript: (text) => log("assistant", text),
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

  const togglePause = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (pausedRef.current) {
        await backend.resumeInterview(interview.id);
        setPaused(false);
        pausedRef.current = false;
        log("interview", "resumed");
      } else {
        await backend.pauseInterview(interview.id);
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
  }, [backend, interview.id, log, refreshSnapshot]);

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
  useEffect(() => {
    if (!liveStarted) return;
    const timer = setInterval(() => {
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
    refresh: refreshSnapshot,
    log,
    clearError: () => setError(null),
  };
}
