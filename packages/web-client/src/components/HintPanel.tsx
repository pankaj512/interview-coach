// HLD 4.2/5.4 — candidate hint panel (S5b).
//
// The candidate asks for a hint through the same S5 tool path the model
// uses: POST .../tool-exec with a UI-generated call_id and the
// get_problem_hint tool. Hint accounting (hintsUsed, 3 capped tiers) stays
// backend-owned; the panel only displays what the server returns.
// Hints-left indicator follows the design handoff (ux-spec §8: H-Live
// hints-left + Results timeline header).

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import { formatApiError } from "../state/use-interview.js";

const MAX_HINT_TIER = 3;

interface HintView {
  readonly level: number;
  readonly hint: string;
  readonly hintsUsed: number;
}

export function HintPanel({
  backend,
  interviewId,
  initialHintsUsed,
  onHint,
}: {
  backend: BackendClient;
  interviewId: string;
  initialHintsUsed: number;
  onHint: (detail: string) => void;
}) {
  const [hint, setHint] = useState<HintView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hintsUsed = hint?.hintsUsed ?? initialHintsUsed;

  async function requestHint() {
    setBusy(true);
    setError(null);
    try {
      // UI-generated call_id: backend idempotency dedups retries of THIS
      // click; every new click is a new hint (same as the model path).
      const callId = `ui_hint_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
      const outcome = await backend.toolExec(interviewId, callId, "get_problem_hint");
      if (outcome.ok) {
        const result = outcome.result as { level?: unknown; hint?: unknown; hintsUsed?: unknown };
        const view: HintView = {
          level: typeof result.level === "number" ? result.level : 1,
          hint: typeof result.hint === "string" ? result.hint : "No hint available.",
          hintsUsed: typeof result.hintsUsed === "number" ? result.hintsUsed : hintsUsed + 1,
        };
        setHint(view);
        onHint(`hint level ${view.level} (${callId.slice(0, 8)}…)`);
      } else {
        setError(`${outcome.code}: ${outcome.message}`);
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Hints</h3>
      <p className="hint">
        Hints used: {hintsUsed} · tier {Math.min(hintsUsed + 1, MAX_HINT_TIER)} of {MAX_HINT_TIER} next.
        Hints guide without revealing the solution and count toward evaluation.
      </p>
      <button type="button" disabled={busy} onClick={requestHint}>
        {busy ? "Asking…" : "Ask for a hint"}
      </button>
      {error !== null && <p className="error">{error}</p>}
      {hint !== null && (
        <p>
          <strong>Level {hint.level}:</strong> {hint.hint}
        </p>
      )}
    </section>
  );
}
