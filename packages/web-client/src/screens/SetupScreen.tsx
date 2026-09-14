// H-New-Interview (ux-spec §5–§7): type, difficulty, style, interaction,
// duration → create + auto-select + ready, then the device gate.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { InterviewConfiguration, SerializedInterview } from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Eyebrow, Pill, RadioCard, Segmented } from "../ds/primitives.js";
import { useBackendClient, useInterviewSetup } from "../state/use-interview.js";
import { useAuthSession } from "../state/auth-store.js";

export type InterviewMode = "Realistic Interview" | "Guided Coaching";
export type Interaction = "Voice" | "Text";
type Difficulty = "Easy" | "Medium" | "Hard";

export interface SetupResult {
  readonly interview: SerializedInterview;
  readonly mode: InterviewMode;
  readonly interaction: Interaction;
  readonly durationMinutes: number;
  readonly difficulty: Difficulty;
}

const TYPES: readonly { name: string; focus: string; enabled: boolean }[] = [
  { name: "Coding", focus: "Algorithms, data structures, complexity", enabled: true },
  { name: "System Design", focus: "Architecture, scalability", enabled: false },
  { name: "Backend", focus: "APIs, databases, reliability", enabled: false },
  { name: "Behavioral", focus: "Communication, ownership", enabled: false },
  { name: "Resume / Project Deep Dive", focus: "Questions grounded in your own experience", enabled: false },
];

const STEPS: readonly { title: string; detail: string }[] = [
  { title: "1 · Configure", detail: "type, difficulty, style, duration" },
  { title: "2 · Device check", detail: "microphone + speaker gate" },
  { title: "3 · Live interview", detail: "the interviewer speaks first" },
  { title: "4 · Results", detail: "evaluation, feedback, next practice" },
];

export function SetupScreen({
  onCreated,
  onCancel,
}: {
  readonly onCreated: (result: SetupResult) => void;
  readonly onCancel: () => void;
}) {
  const backend: BackendClient = useBackendClient();
  const session = useAuthSession();
  const { setup, busy, error } = useInterviewSetup(backend);
  const [type, setType] = useState("Coding");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [mode, setMode] = useState<InterviewMode>("Realistic Interview");
  const [interaction, setInteraction] = useState<Interaction>("Voice");
  const [duration, setDuration] = useState(30);

  // Phase 2: sign-in is required (App gate); the backend stamps the real
  // candidate id from the session for user callers, so this is only a
  // non-authoritative label fallback.
  const candidateId = session?.displayName ?? session?.email ?? "user";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const configuration: InterviewConfiguration = {
      interviewType: "dsa",
      difficulty,
      durationMinutes: duration,
      problemCount: 1,
    };
    try {
      const interview = await setup({ candidateId, configuration, problemIds: [], autoSelect: true });
      onCreated({ interview, mode, interaction, durationMinutes: duration, difficulty });
    } catch {
      // error surfaces via the hook
    }
  }

  return (
    <div className="setup-screen">
      <header className="setup-topbar">
        <button type="button" className="link-button" onClick={onCancel}>
          ← Back
        </button>
        <span className="brand">Interview Coach</span>
      </header>

      <form className="setup-layout" onSubmit={submit}>
        <div className="setup-main">
          <Eyebrow>New interview</Eyebrow>
          <h1 className="page-title">New Interview</h1>
          <p className="lede">Configure your practice session. The interviewer will adapt to your choices.</p>

          <Eyebrow>Interview type</Eyebrow>
          <div className="radio-grid">
            {TYPES.map((t, i) => (
              <RadioCard
                key={t.name}
                title={t.name}
                subtitle={t.enabled ? t.focus : `${t.focus} · Soon`}
                selected={type === t.name}
                disabled={!t.enabled}
                className={i === TYPES.length - 1 && TYPES.length % 2 === 1 ? "span-2" : ""}
                onSelect={() => setType(t.name)}
              />
            ))}
          </div>

          <Eyebrow>Difficulty</Eyebrow>
          <div className="pill-row" role="group" aria-label="Difficulty">
            {(["Easy", "Medium", "Hard"] as const).map((level) => (
              <Pill key={level} label={level} selected={difficulty === level} onClick={() => setDifficulty(level)} />
            ))}
          </div>

          <Eyebrow>Interview style</Eyebrow>
          <div className="radio-grid two">
            <RadioCard
              title="Realistic Interview"
              subtitle="Minimal hints, natural follow-ups, feedback after."
              selected={mode === "Realistic Interview"}
              onSelect={() => setMode("Realistic Interview")}
            />
            <RadioCard
              title="Guided Coaching"
              subtitle="Hints, clarification, and feedback available live."
              selected={mode === "Guided Coaching"}
              onSelect={() => setMode("Guided Coaching")}
            />
          </div>

          <Eyebrow>Interaction</Eyebrow>
          <div className="inline-controls">
            <Segmented
              options={["Voice", "Text"] as const}
              value={interaction}
              onChange={setInteraction}
              ariaLabel="Interaction mode"
            />
            <span className="hint">Text is always available as a fallback.</span>
          </div>

          <Eyebrow>Duration</Eyebrow>
          <div className="pill-row" role="group" aria-label="Duration">
            {[15, 30, 45, 60].map((minutes) => (
              <Pill
                key={minutes}
                label={`${minutes} min`}
                selected={duration === minutes}
                onClick={() => setDuration(minutes)}
              />
            ))}
          </div>
        </div>

        <aside className="setup-side">
          <div className="card summary-card">
            <h3 className="section-title">Session summary</h3>
            <dl className="summary">
              <div>
                <dt>Type</dt>
                <dd>{type}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>{difficulty}</dd>
              </div>
              <div>
                <dt>Style</dt>
                <dd>{mode}</dd>
              </div>
              <div>
                <dt>Interaction</dt>
                <dd>{interaction}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{duration} minutes</dd>
              </div>
            </dl>
            <p className="hint">You can change all of this before you begin. Headphones recommended.</p>
            <div className="row actions">
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? "Creating…" : "Start interview"}
              </PrimaryButton>
              <GhostButton onClick={onCancel}>Cancel</GhostButton>
            </div>
            {error !== null && <p className="error">{error}</p>}
          </div>

          <div className="card steps-card">
            <h3 className="section-title">How the session works</h3>
            <ol className="steps-list">
              {STEPS.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <span className="hint">{step.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </form>
    </div>
  );
}
