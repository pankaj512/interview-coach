// H-Evaluating (ux-spec §21): analyzing screen shown after End & Evaluate.

import { ProgressChecklist } from "../ds/primitives.js";

const STEPS: readonly { label: string; state: "done" | "active" | "todo" }[] = [
  { label: "Technical reasoning", state: "done" },
  { label: "Communication", state: "done" },
  { label: "Problem solving", state: "done" },
  { label: "Generating feedback", state: "active" },
];

export function EvaluatingScreen() {
  return (
    <div className="briefing-wrap">
      <section className="card evaluating-card" aria-label="Analyzing interview">
        <h1 className="briefing-title">Analyzing Interview</h1>
        <p className="lede">Reviewing your responses…</p>
        <div className="evaluating-steps">
          <ProgressChecklist items={STEPS} />
        </div>
        <div className="meter analyzing-meter" role="progressbar" aria-label="Analyzing">
          <div className="meter-fill" style={{ width: "70%" }} />
        </div>
        <p className="hint">Please wait…</p>
        <p className="hint">No fake precision — the evaluation is generated, not a loading percentage.</p>
      </section>
    </div>
  );
}
