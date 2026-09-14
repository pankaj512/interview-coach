// H-Lobby (roadmap Phase 6): the final pre-interview step.
//
// The system chooses the practice — the Lobby shows the server recommendation
// (type/topic/problem/difficulty/objective) and prepares the session. There is
// no topic/difficulty/problem selection here (the manual Setup screen is
// retired): "Begin interview" is gated on the microphone check AND the server's
// voice readiness, so a session that would 503 on mint can never start.

import { useCallback, useEffect, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, Eyebrow } from "../ds/primitives.js";
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

const CRITERIA: readonly string[] = [
  "Problem solving",
  "Technical depth",
  "Communication",
  "Trade-off analysis",
];

function micHint(mic: MicState): string {
  switch (mic) {
    case "ready":
      return "Access granted. We'll use your microphone for the voice interview.";
    case "denied":
      return "Allow microphone access in your browser (address-bar mic icon), then retry. Headphones recommended.";
    case "unsupported":
      return "This browser did not expose a microphone API. Use a recent Chrome, Edge, or Firefox over HTTPS or localhost.";
    case "checking":
      return "Waiting for microphone permission…";
  }
}

function sessionHint(session: SessionReadiness): string {
  switch (session) {
    case "ready":
      return "The voice interviewer is configured and ready.";
    case "checking":
      return "Checking that the voice interviewer is available…";
    case "unconfigured":
      return "Voice is not configured on the server. Ask your administrator to enable Azure Voice Live, then retry.";
    case "error":
      return "Couldn't reach the server to verify the session. Check your connection and retry.";
  }
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

  return (
    <div className="briefing-wrap">
      <section className="card briefing-card" aria-label="Interview lobby">
        <div>
          <p className="eyebrow eyebrow-accent">Interview ready</p>
          <h1 className="briefing-title">
            {config.interviewType === "dsa" ? "Coding" : config.interviewType} Interview
          </h1>
          <p className="briefing-meta">
            {plan.difficulty} · {plan.durationMinutes} minutes · {plan.mode} · {plan.interaction}
          </p>
        </div>

        <hr className="rule" />

        <div className="lobby-recommendation">
          <Eyebrow>Recommended practice</Eyebrow>
          {view === null ? (
            <p className="hint">This session is not bound to a recommendation.</p>
          ) : (
            <Card className="recommendation-card">
              <div className="recommendation-head">
                <span className="badge">{view.typeLabel}</span>
                {plan.recommendation !== null && (
                  <span className="hint">{recommendationSourceLabel(plan.recommendation.source)}</span>
                )}
              </div>
              <h3 className="cta-title">{view.topicName}</h3>
              {view.moduleName !== null && <p className="cta-sub">{view.moduleName}</p>}
              {view.problemTitle !== null && (
                <p className="recommendation-problem">
                  {view.problemTitle}
                  {view.problemDifficulty !== null && (
                    <span className="badge recommendation-difficulty">{view.problemDifficulty}</span>
                  )}
                </p>
              )}
              <p className="recommendation-reason">{view.reason}</p>
            </Card>
          )}
        </div>

        <hr className="rule" />

        <h2 className="section-title">You will be evaluated on</h2>
        <ul className="criteria-list">
          {CRITERIA.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="hint">
          The interviewer may interrupt with follow-up questions. Speak naturally — barge-in is supported.
        </p>

        <hr className="rule" />

        <h2 className="section-title">Session prep</h2>
        <ul className="readiness-list" aria-live="polite">
          <li className="readiness-item">
            <span className={mic === "ready" ? "chip-signed" : "chip-guest"}>
              {mic === "ready" ? "●" : "⌀"} {micReadyLabel(mic)}
            </span>
            {micRetryable && <GhostButton onClick={() => void requestMic()}>Enable microphone</GhostButton>}
          </li>
          <li className="readiness-item">
            <span className={session === "ready" ? "chip-signed" : "chip-guest"}>
              {session === "ready" ? "●" : "⌀"} {sessionReadyLabel(session)}
            </span>
            {sessionRetryable && <GhostButton onClick={() => void checkSession()}>Retry session</GhostButton>}
          </li>
        </ul>
        <p className="hint">{micHint(mic)}</p>
        <p className="hint">{sessionHint(session)}</p>

        <hr className="rule" />
        <div className="row actions">
          <PrimaryButton onClick={onBegin} disabled={!ready}>
            Begin interview
          </PrimaryButton>
          <GhostButton onClick={onChangeGoal}>Change goal</GhostButton>
          <GhostButton onClick={onBack}>Back</GhostButton>
        </div>
      </section>
    </div>
  );
}
