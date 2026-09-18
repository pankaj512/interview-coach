// H-Evaluating (feature 17b): analyzing screen shown after End & Evaluate
// on the approved prototype look. Honest processing stages mirror the real
// async pipeline (capture → score → skills → recommendation); no fake
// precision. An optional error message covers evaluation failure without
// losing the interview (the backend fallback path).

import { GhostButton } from "../ds/buttons.js";
import { Badge, Card } from "../ds/primitives.js";

const STEPS: readonly { label: string; detail: string; state: "done" | "active" | "todo" }[] = [
  { label: "Transcript captured", detail: "saved", state: "done" },
  { label: "Scoring 7 dimensions", detail: "analyzing…", state: "active" },
  { label: "Updating skills", detail: "waiting", state: "todo" },
  { label: "Regenerating recommendation", detail: "waiting", state: "todo" },
];

function stepBadge(state: "done" | "active" | "todo"): { tone: "pass" | "active" | "neutral"; label: string } {
  if (state === "done") return { tone: "pass", label: "Complete" };
  if (state === "active") return { tone: "active", label: "Analyzing" };
  return { tone: "neutral", label: "Pending" };
}

export function EvaluatingScreen({
  onBack,
  error = null,
}: {
  readonly onBack?: () => void;
  /** Evaluation failure text. The interview itself is always preserved. */
  readonly error?: string | null;
}) {
  return (
    <div className="eval-wrap">
      <p className="eyebrow">Evaluation in progress</p>
      <h1>Analyzing your interview</h1>
      <p className="sub">
        Structured scoring runs async after End. Results appear automatically; nothing here needs a
        click.
      </p>
      {error === null && (
        <div className="spinner" role="progressbar" aria-label="Evaluation in progress" />
      )}
      <Card className="eval-card">
        <ul className="stages">
          {STEPS.map((step) => {
            const badge = stepBadge(step.state);
            return (
              <li key={step.label}>
                <span className={`mark ${step.state === "done" ? "ok" : step.state === "active" ? "busy" : "todo"}`}>
                  {step.state === "done" ? "✓" : ""}
                </span>
                {step.label}
                <span className="detail">{step.detail}</span>
              </li>
            );
          })}
        </ul>
      </Card>
      {error !== null && (
        <p className="eval-alert" role="alert">
          {error} Your interview is saved; retry scoring or continue to history.
        </p>
      )}
      {onBack !== undefined && (
        <div className="row actions">
          <GhostButton onClick={onBack}>Back to dashboard</GhostButton>
        </div>
      )}
      <p className="fine">A failed evaluation never loses the interview; the fallback path keeps history intact.</p>
    </div>
  );
}
