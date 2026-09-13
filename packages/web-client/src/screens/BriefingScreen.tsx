// H-Briefing (ux-spec §8): Interview Ready — sets expectations before join and
// requests the microphone here (the separate device-gate screen is gone).

import { useCallback, useEffect, useState } from "react";
import type { SerializedInterview } from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import type { Interaction, InterviewMode } from "./SetupScreen.js";

const CRITERIA: readonly string[] = [
  "Problem solving",
  "Technical depth",
  "Communication",
  "Trade-off analysis",
];

type MicState = "checking" | "ready" | "denied" | "unsupported";

export function BriefingScreen({
  interview,
  mode,
  interaction,
  onBegin,
  onBack,
}: {
  readonly interview: SerializedInterview;
  readonly mode: InterviewMode;
  readonly interaction: Interaction;
  readonly onBegin: () => void;
  readonly onBack: () => void;
}) {
  const config = interview.configuration;
  const [mic, setMic] = useState<MicState>("checking");

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

  const micReady = mic === "ready";

  return (
    <div className="briefing-wrap">
      <section className="card briefing-card" aria-label="Interview briefing">
        <p className="eyebrow eyebrow-accent">Interview ready</p>
        <h1 className="briefing-title">{config.interviewType === "dsa" ? "Coding" : config.interviewType} Interview</h1>
        <p className="briefing-meta">
          {config.difficulty ?? "Medium"} · {config.durationMinutes !== undefined ? `${config.durationMinutes} minutes` : "Open"} · {mode} · {interaction}
        </p>
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

        <div className="mic-check" aria-live="polite">
          {mic === "ready" && <span className="chip-signed">● Microphone ready</span>}
          {mic === "checking" && <span className="chip-status chip-connecting">◌ Checking microphone…</span>}
          {mic === "denied" && <span className="chip-guest">⌀ Microphone blocked</span>}
          {mic === "unsupported" && <span className="chip-guest">⌀ Microphone unavailable</span>}
          <p className="hint">
            {mic === "ready"
              ? "Access granted. We'll use your microphone for the voice interview."
              : mic === "denied"
                ? "Allow microphone access in your browser (address-bar mic icon), then retry. Headphones recommended."
                : mic === "unsupported"
                  ? "This browser did not expose a microphone API. Use a recent Chrome, Edge, or Firefox over HTTPS or localhost."
                  : "Waiting for microphone permission…"}
          </p>
          {(mic === "denied" || mic === "unsupported") && (
            <GhostButton onClick={() => void requestMic()}>Enable microphone</GhostButton>
          )}
        </div>

        <hr className="rule" />
        <div className="row actions">
          <PrimaryButton onClick={onBegin} disabled={!micReady}>
            Begin interview
          </PrimaryButton>
          <GhostButton onClick={onBack}>Back</GhostButton>
        </div>
      </section>
    </div>
  );
}
