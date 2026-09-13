// H-Briefing (ux-spec §8): Interview Ready — sets expectations before join.

import type { SerializedInterview } from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import type { Interaction, InterviewMode } from "./SetupScreen.js";

const CRITERIA: readonly string[] = [
  "Problem solving",
  "Technical depth",
  "Communication",
  "Trade-off analysis",
];

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
        <div className="row actions">
          <PrimaryButton onClick={onBegin}>Begin interview</PrimaryButton>
          <GhostButton onClick={onBack}>Back</GhostButton>
        </div>
      </section>
    </div>
  );
}
