// H-Evaluating (ux-spec §21): analyzing screen shown after End & Evaluate.
//
// v1.1 Stitch (`analyzing-interview/code.html`): centered card with title +
// checklist steps (Complete / Analyzing / Pending badges) and spinner; a
// back-to-dashboard option is offered (optional prop — App may omit it).

import { GhostButton } from "../ds/buttons.js";
import { Badge, Card } from "../ds/primitives.js";

const STEPS: readonly { label: string; state: "done" | "active" | "todo" }[] = [
  { label: "Technical reasoning", state: "done" },
  { label: "Communication", state: "done" },
  { label: "Problem solving", state: "done" },
  { label: "Generating feedback", state: "active" },
];

function stepBadge(state: "done" | "active" | "todo"): { tone: "pass" | "active" | "neutral"; label: string } {
  if (state === "done") return { tone: "pass", label: "Complete" };
  if (state === "active") return { tone: "active", label: "Analyzing" };
  return { tone: "neutral", label: "Pending" };
}

export function EvaluatingScreen({ onBack }: { readonly onBack?: () => void }) {
  return (
    <div className="briefing-wrap">
      <Card className="evaluating-card" role="status" aria-label="Analyzing interview">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div className="wave wave-live" aria-hidden="true" style={{ minWidth: 120 }}>
            <span className="wave-bar" />
            <span className="wave-bar" />
            <span className="wave-bar" />
            <span className="wave-bar" />
            <span className="wave-bar" />
          </div>
          <h1 className="briefing-title">Analyzing Interview</h1>
          <p className="lede">Reviewing your responses…</p>
        </div>
        <ol className="plain-list evaluating-steps">
          {STEPS.map((step) => {
            const badge = stepBadge(step.state);
            return (
              <li
                key={step.label}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <span>
                  {step.state === "done" ? "✓ " : step.state === "active" ? "◌ " : "○ "}
                  {step.label}
                </span>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </li>
            );
          })}
        </ol>
        <div className="meter analyzing-meter" role="progressbar" aria-label="Analyzing">
          <div className="meter-fill" style={{ width: "70%" }} />
        </div>
        <p className="hint">Please wait… no fake precision — the evaluation is generated, not a percentage.</p>
        {onBack !== undefined && (
          <div className="row actions">
            <GhostButton onClick={onBack}>Back to dashboard</GhostButton>
          </div>
        )}
      </Card>
    </div>
  );
}
