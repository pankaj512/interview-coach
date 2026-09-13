// HLD 4.5/5.5 — structured evaluation finalize form (S5b).
//
// Scores are backend-owned: the form collects dimension scores plus
// strengths/weaknesses and POSTs to .../evaluation, which computes the
// overall score and derives the recommendation (S5a pipeline). The client
// never scores locally.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { EvaluationInput, SerializedEvaluation } from "../api/types.js";
import { dimensionLabel } from "../dimensions.js";
import { formatApiError } from "../state/use-interview.js";

// HLD 5.8 dimension set (structural mirror of the domain; the results panel
// renders whatever keys the backend returns).
export const EVALUATION_DIMENSIONS: readonly string[] = [
  "understanding",
  "approach",
  "correctness",
  "complexity",
  "edge_cases",
  "communication",
  "code_quality",
  "independence",
];

export function EvaluationForm({
  backend,
  interviewId,
  onEvaluated,
}: {
  backend: BackendClient;
  interviewId: string;
  onEvaluated: (evaluation: SerializedEvaluation) => void;
}) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setScore(dimension: string, value: string) {
    setScores((prev) => ({ ...prev, [dimension]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const dimensions: Record<string, { score: number }> = {};
      for (const dimension of EVALUATION_DIMENSIONS) {
        const raw = scores[dimension];
        if (raw === undefined || raw === "") continue;
        const score = Number.parseInt(raw, 10);
        if (Number.isInteger(score) && score >= 0 && score <= 5) {
          dimensions[dimension] = { score };
        }
      }
      const split = (value: string): readonly string[] =>
        value
          .split(/[;\n]+/)
          .map((s) => s.trim())
          .filter((s) => s !== "");
      const input: EvaluationInput = {
        ...(Object.keys(dimensions).length === 0 ? {} : { dimensions }),
        ...(split(strengths).length === 0 ? {} : { strengths: split(strengths) }),
        ...(split(weaknesses).length === 0 ? {} : { weaknesses: split(weaknesses) }),
      };
      onEvaluated(await backend.submitEvaluation(interviewId, input));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Finalize evaluation</h3>
      <p className="hint">
        Score each dimension 0–5 (leave blank to skip). The backend computes the overall score and
        recommendation — heavy hinting downgrades one tier.
      </p>
      {EVALUATION_DIMENSIONS.map((dimension) => (
        <label key={dimension}>
          {dimensionLabel(dimension)}
          <select value={scores[dimension] ?? ""} onChange={(e) => setScore(dimension, e.target.value)}>
            <option value="">—</option>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Strengths (semicolon separated)
        <input value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="clear communication; edge cases" />
      </label>
      <label>
        Weaknesses (semicolon separated)
        <input value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} placeholder="complexity analysis" />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Submit evaluation"}
      </button>
      {error !== null && <p className="error">{error}</p>}
    </form>
  );
}
