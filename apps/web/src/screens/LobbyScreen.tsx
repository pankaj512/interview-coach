// H-Lobby (feature 17b): the final pre-interview step on the approved
// prototype look.
//
// The system chooses the practice - the Lobby shows the server recommendation
// (type/topic/problem/difficulty/objective) and prepares the session. There is
// no topic/difficulty/problem selection here: "Begin interview" is gated on
// the microphone check AND the server's voice readiness, so a session that
// would 503 on mint can never start.

import { useCallback, useEffect, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { buildRecommendationView, recommendationSourceLabel } from "../dashboard.js";
import type { SessionPlan } from "../flow.js";
import {
  canBegin,
  micReadyLabel,
  sessionReadinessFromVoiceMode,
  sessionReadyLabel,
  type MicState,
  type SessionReadiness,
} from "../lobby.js";

function micHint(mic: MicState): string {
  switch (mic) {
    case "ready":
      return "Access granted. We'll use your microphone for the voice interview.";
    case "denied":
      return "Allow microphone access in your browser (address-bar mic icon), then retry. Headphones recommended.";
    case "unsupported":
      return "This browser did not expose a microphone API. Use a recent Chrome, Edge, or Firefox over HTTPS or localhost.";
    case "checking":
      return "Waiting for microphone permission...";
  }
}

function sessionHint(session: SessionReadiness): string {
  switch (session) {
    case "ready":
      return "The voice interviewer is configured and ready.";
    case "checking":
      return "Checking that the voice interviewer is available...";
    case "unconfigured":
      return "Voice is not configured on the server. Ask your administrator to enable Azure Voice Live, then retry.";
    case "error":
      return "Couldn't reach the server to verify the session. Check your connection and retry.";
  }
}

function micMark(mic: MicState): "ok" | "busy" | "todo" {
  if (mic === "ready") return "ok";
  if (mic === "checking") return "busy";
  return "todo";
}

function sessionMark(session: SessionReadiness): "ok" | "busy" | "todo" {
  if (session === "ready") return "ok";
  if (session === "checking") return "busy";
  return "todo";
}

export function LobbyScreen({
  backend,
  plan,
  onBegin,
  onChangeGoal,
  onBack,
}: {
  readonly backend: BackendClient;
  readonly plan: SessionPlan;
  readonly onBegin: () => void;
  readonly onChangeGoal: () => void;
  readonly onBack: () => void;
}) {
  const config = plan.interview.configuration;
  const view =
    plan.recommendation === null
      ? null
      : buildRecommendationView(plan.recommendation, plan.curriculum, plan.problem);
  const [mic, setMic] = useState<MicState>("checking");
  const [session, setSession] = useState<SessionReadiness>("checking");

  const requestMic = useCallback(async () => {
    const media = navigator.mediaDevices;
    if (media === undefined || typeof media.getUserMedia !== "function") {
      setMic("unsupported");
      return;
    }
    setMic("checking");
    try {
      // Verify access; the live room re-opens the stream on join.
      const stream = await media.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      setMic("ready");
    } catch {
      setMic("denied");
    }
  }, []);

  const checkSession = useCallback(async () => {
    setSession("checking");
    try {
      const ready = await backend.getReady();
      setSession(sessionReadinessFromVoiceMode(ready.voiceMode));
    } catch {
      setSession("error");
    }
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    async function ensure() {
      const media = navigator.mediaDevices;
      if (media === undefined || typeof media.getUserMedia !== "function") {
        if (!cancelled) setMic("unsupported");
        return;
      }
      // Already granted: proceed without re-prompting. Otherwise request here.
      try {
        const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
        if (status?.state === "denied") {
          if (!cancelled) setMic("denied");
          return;
        }
      } catch {
        // Permissions API unavailable; fall through to getUserMedia.
      }
      if (!cancelled) await requestMic();
    }
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [requestMic]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const ready = canBegin(mic, session);
  const micRetryable = mic === "denied" || mic === "unsupported";
  const sessionRetryable = session === "unconfigured" || session === "error";
  const problemTitle = view?.problemTitle ?? plan.problem?.title ?? null;

  return (
    <div className="lobby-wrap">
      <p className="eyebrow">
        Lobby · {config.interviewType === "dsa" ? "DSA" : config.interviewType} · {plan.difficulty} ·{" "}
        {plan.durationMinutes} min
      </p>
      <h1>Preparing your interview</h1>
      <p className="sub">
        Each check gates the interview: Begin unlocks once everything passes. No voice session is
        minted before that moment.
      </p>
      <div className="lobby-grid">
        {view === null ? (
          <div className="card">
            <h2>Session details</h2>
            <p className="hint">This session is not bound to a recommendation.</p>
            <p className="hint">
              {plan.difficulty} · {plan.durationMinutes} minutes · {plan.mode} · {plan.interaction}
            </p>
          </div>
        ) : (
          <div className="rec">
            <span className="tag">{view.typeLabel}</span>
            <span className="tag">{recommendationSourceLabel(plan.recommendation?.source ?? "fallback")}</span>
            <h2>
              {view.topicName}
              {view.problemTitle !== null && <> · {view.problemTitle}</>}{" "}
              {view.problemDifficulty !== null && <span className="lvl">{view.problemDifficulty}</span>}
            </h2>
            {view.moduleName !== null && <p>{view.moduleName}</p>}
            <p className="reason">{view.reason}</p>
          </div>
        )}
        <div className="card">
          <h2>Setup checks</h2>
          <ul className="checks">
            <li>
              <span className="mark ok">✓</span> Problem loaded
              <span className="detail">{problemTitle ?? "waiting"}</span>
            </li>
            <li>
              <span className={`mark ${micMark(mic)}`}>{mic === "ready" ? "✓" : ""}</span>{" "}
              {micReadyLabel(mic)}
              <span className="detail">{mic === "checking" ? "requesting" : mic}</span>
            </li>
            <li>
              <span className={`mark ${sessionMark(session)}`}>{session === "ready" ? "✓" : ""}</span>{" "}
              {sessionReadyLabel(session)}
              <span className="detail">{session === "checking" ? "verifying" : session}</span>
            </li>
          </ul>
          {(mic !== "ready" || session !== "ready") && (
            <p className="hint">
              {micHint(mic)} {sessionHint(session)}
            </p>
          )}
          <div className="row actions">
            {micRetryable && <GhostButton onClick={() => void requestMic()}>Enable microphone</GhostButton>}
            {sessionRetryable && <GhostButton onClick={() => void checkSession()}>Retry session</GhostButton>}
          </div>
        </div>
      </div>
      {ready && (
        <div className="banner" role="status">
          All checks green - begin when ready.
        </div>
      )}
      <div className="row actions">
        <PrimaryButton onClick={onBegin} disabled={!ready}>
          Begin interview
        </PrimaryButton>
        <GhostButton onClick={onChangeGoal}>Change goal</GhostButton>
        <GhostButton onClick={onBack}>Back</GhostButton>
      </div>
      {!ready && <p className="hint">Begin unlocks when the microphone and voice session are both ready.</p>}
    </div>
  );
}
