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
import { Badge, Card, ChipList, CtaCard, SectionHead, VoiceRail, Wave } from "../ds/primitives.js";
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
      <div className="screen" style={{ maxWidth: 1180 }}>
        <div>
          <ChipList label="Environment status">
            <Badge tone={ready ? "pass" : "neutral"}>
              {ready ? "[READY] Environment verified" : "[CHECK] Verifying environment"}
            </Badge>
            <Badge tone="neutral">{plan.difficulty}</Badge>
            <Badge tone="neutral">{plan.durationMinutes} min</Badge>
            <Badge tone="active">{plan.mode}</Badge>
          </ChipList>
          <h1 className="briefing-title" style={{ textAlign: "left", marginTop: 8 }}>
            Interview simulation lobby — {config.interviewType === "dsa" ? "Coding" : config.interviewType}
          </h1>
          <p className="hint">All environment checks passed. Ready to initiate the voice session.</p>
        </div>

        <div className="two-col" style={{ gridTemplateColumns: "2fr 1fr", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <SectionHead
                title="Mic & audio readiness"
                meta="Input device active"
              />
              <VoiceRail
                state={
                  <Badge tone={mic === "ready" ? "pass" : mic === "checking" ? "active" : "review"}>
                    {mic === "ready" ? "[MIC] Ready" : `[MIC] ${micReadyLabel(mic)}`}
                  </Badge>
                }
                waveform={<Wave active={mic === "ready"} live={mic === "checking"} />}
                controls={
                  <>
                    {micRetryable && (
                      <GhostButton onClick={() => void requestMic()}>Enable microphone</GhostButton>
                    )}
                    {sessionRetryable && (
                      <GhostButton onClick={() => void checkSession()}>Retry session</GhostButton>
                    )}
                  </>
                }
                caption={
                  <>
                    {micHint(mic)} {sessionHint(session)}
                  </>
                }
              />
              <ul className="readiness-list" aria-live="polite" style={{ marginTop: 12 }}>
                <li className="readiness-item">
                  <Badge tone={mic === "ready" ? "pass" : "review"}>{micReadyLabel(mic)}</Badge>
                </li>
                <li className="readiness-item">
                  <Badge tone={session === "ready" ? "pass" : "review"}>{sessionReadyLabel(session)}</Badge>
                </li>
              </ul>
            </Card>

            <Card>
              <SectionHead title="Evaluation criteria" />
              <ul className="criteria-list">
                {CRITERIA.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="hint">
                The interviewer may interrupt with follow-up questions. Speak naturally — barge-in is
                supported.
              </p>
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {view === null ? (
              <Card>
                <SectionHead title="Briefing summary" />
                <p className="hint">This session is not bound to a recommendation.</p>
                <p className="hint">
                  {plan.difficulty} · {plan.durationMinutes} minutes · {plan.mode} · {plan.interaction}
                </p>
              </Card>
            ) : (
              <CtaCard
                eyebrow={`${view.typeLabel} · ${recommendationSourceLabel(plan.recommendation?.source ?? "fallback")}`}
                title={view.topicName}
                sub={
                  view.moduleName ??
                  `${plan.difficulty} · ${plan.durationMinutes} minutes · ${plan.mode} · ${plan.interaction}`
                }
              >
                {view.problemTitle !== null && (
                  <p className="recommendation-problem">
                    {view.problemTitle}
                    {view.problemDifficulty !== null && (
                      <Badge tone="neutral">{view.problemDifficulty}</Badge>
                    )}
                  </p>
                )}
                <p className="recommendation-reason">{view.reason}</p>
              </CtaCard>
            )}

            <Card>
              <SectionHead title="Begin" />
              <div className="row actions">
                <PrimaryButton onClick={onBegin} disabled={!ready}>
                  Begin interview
                </PrimaryButton>
                <GhostButton onClick={onChangeGoal}>Change goal</GhostButton>
                <GhostButton onClick={onBack}>Back</GhostButton>
              </div>
              {!ready && (
                <p className="hint">Begin unlocks when the microphone and voice session are both ready.</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
