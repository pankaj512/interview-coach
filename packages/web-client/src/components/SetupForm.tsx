// HLD 4.1 — interview setup form (S4).
//
// Creates a DSA interview: candidate id + configuration (difficulty,
// duration, problem count) + optional canonical problem ids. Problem ids are
// validated live against GET /api/problems/:id; a problem browser with
// server-side listing lands with S5 intelligence.

import { useState } from "react";
import { BackendClient } from "../api/backend-client.js";
import type { InterviewConfiguration, Problem } from "../api/types.js";
import { formatApiError, useBackendClient, useInterviewSetup } from "../state/use-interview.js";
import type { SerializedInterview } from "../api/types.js";

export function SetupForm({ onReady }: { onReady: (interview: SerializedInterview) => void }) {
  const backend: BackendClient = useBackendClient();
  const { setup, busy, error } = useInterviewSetup(backend);
  const [candidateId, setCandidateId] = useState("");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Mixed">("Mixed");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [problemIdsRaw, setProblemIdsRaw] = useState("");
  const [checked, setChecked] = useState<readonly (Problem | null)[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const problemIds = problemIdsRaw
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => id !== "");

  async function checkProblems() {
    setChecking(true);
    setCheckError(null);
    try {
      const results: (Problem | null)[] = [];
      for (const id of problemIds.slice(0, 10)) {
        try {
          results.push(await backend.getProblem(id));
        } catch (e) {
          results.push(null);
          setCheckError(`Unknown problem id (skipped): ${id} — ${formatApiError(e)}`);
        }
      }
      setChecked(results);
    } finally {
      setChecking(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const duration = Number.parseInt(durationMinutes, 10);
    const configuration: InterviewConfiguration = {
      interviewType: "dsa",
      difficulty,
      ...(Number.isFinite(duration) && duration > 0 ? { durationMinutes: Math.min(duration, 480) } : {}),
      ...(problemIds.length > 0 ? { problemCount: Math.min(problemIds.length, 20) } : {}),
    };
    try {
      // Only attach problems the backend confirms exist.
      const valid = problemIds.filter((_, i) => checked[i] !== undefined && checked[i] !== null);
      const interview = await setup({
        candidateId: candidateId.trim() === "" ? "candidate" : candidateId.trim(),
        configuration,
        problemIds: valid.length > 0 ? valid : problemIds,
      });
      onReady(interview);
    } catch {
      // error surfaces via the hook
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Start a DSA interview</h2>
      <label>
        Candidate id
        <input value={candidateId} onChange={(e) => setCandidateId(e.target.value)} placeholder="candidate" maxLength={200} />
      </label>
      <div className="row">
        <label>
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as "Easy" | "Medium" | "Mixed")}>
            <option value="Mixed">Mixed</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
          </select>
        </label>
        <label>
          Duration (min)
          <input value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} inputMode="numeric" placeholder="30" />
        </label>
      </div>
      <label>
        Problem ids (optional, comma/space separated — e.g. prob_3sum)
        <input
          value={problemIdsRaw}
          onChange={(e) => setProblemIdsRaw(e.target.value)}
          placeholder="prob_3sum"
          spellCheck={false}
        />
      </label>
      <div className="row">
        <button type="button" disabled={checking || problemIds.length === 0} onClick={checkProblems}>
          {checking ? "Checking…" : "Validate problems"}
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create & ready"}
        </button>
      </div>
      {checked.length > 0 && (
        <ul className="check-list">
          {checked.map((problem, i) => (
            <li key={i} className={problem === null ? "bad" : "good"}>
              {problem === null ? "unknown id" : `${problem.title} (${problem.difficulty})`}
            </li>
          ))}
        </ul>
      )}
      {(error ?? checkError) !== null && <p className="error">{error ?? checkError}</p>}
      <p className="hint">Use headphones — assistant audio leaking into the mic degrades turn detection.</p>
    </form>
  );
}
