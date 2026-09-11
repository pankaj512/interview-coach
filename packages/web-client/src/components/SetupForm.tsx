// HLD 4.1 — interview setup form (S4, S5b problem browser).
//
// Creates a DSA interview: candidate id + configuration (difficulty,
// duration, problem count, topic focus) + problem set via S5 backend
// auto-select (default, deterministic from the configuration) or manual
// pick from the problem browser (GET /api/problems) / raw ids.

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
  const [problemCount, setProblemCount] = useState("1");
  const [topicFocus, setTopicFocus] = useState("");
  const [autoSelect, setAutoSelect] = useState(true);
  const [problemIdsRaw, setProblemIdsRaw] = useState("");
  const [search, setSearch] = useState("");
  const [browseDifficulty, setBrowseDifficulty] = useState<"" | "Easy" | "Medium" | "Hard">("");
  const [browsed, setBrowsed] = useState<readonly Problem[]>([]);
  const [browsedTotal, setBrowsedTotal] = useState<number | null>(null);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const manualIds = (picked.length > 0 ? picked : problemIdsRaw.split(/[\s,]+/).map((id) => id.trim()).filter((id) => id !== ""));

  async function browse() {
    setBrowsing(true);
    setBrowseError(null);
    try {
      const page = await backend.listProblems({
        ...(browseDifficulty === "" ? {} : { difficulty: browseDifficulty }),
        ...(search.trim() === "" ? {} : { q: search.trim() }),
        limit: 20,
      });
      setBrowsed(page.problems);
      setBrowsedTotal(page.total);
    } catch (e) {
      setBrowseError(formatApiError(e));
    } finally {
      setBrowsing(false);
    }
  }

  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id].slice(0, 20)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const duration = Number.parseInt(durationMinutes, 10);
    const count = Math.min(20, Math.max(1, Number.parseInt(problemCount, 10) || 1));
    const topics = topicFocus
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");
    const configuration: InterviewConfiguration = {
      interviewType: "dsa",
      difficulty,
      ...(Number.isFinite(duration) && duration > 0 ? { durationMinutes: Math.min(duration, 480) } : {}),
      problemCount: autoSelect ? count : manualIds.length > 0 ? Math.min(manualIds.length, 20) : count,
      ...(topics.length > 0 ? { topicFocus: topics.slice(0, 20) } : {}),
    };
    try {
      const interview = await setup({
        candidateId: candidateId.trim() === "" ? "candidate" : candidateId.trim(),
        configuration,
        problemIds: autoSelect ? [] : manualIds,
        autoSelect,
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
        <label>
          Problems
          <input value={problemCount} onChange={(e) => setProblemCount(e.target.value)} inputMode="numeric" placeholder="1" />
        </label>
      </div>
      <label>
        Topic focus (optional, comma separated)
        <input value={topicFocus} onChange={(e) => setTopicFocus(e.target.value)} placeholder="Arrays, Two Pointers" />
      </label>
      <label className="row">
        <input type="checkbox" checked={autoSelect} onChange={(e) => setAutoSelect(e.target.checked)} />
        Auto-select problems from configuration (deterministic)
      </label>
      {!autoSelect && (
        <>
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search problems…"
              aria-label="Search problems"
            />
            <select value={browseDifficulty} onChange={(e) => setBrowseDifficulty(e.target.value as "" | "Easy" | "Medium" | "Hard")} aria-label="Filter by difficulty">
              <option value="">Any difficulty</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <button type="button" disabled={browsing} onClick={browse}>
              {browsing ? "Searching…" : "Browse"}
            </button>
          </div>
          {browseError !== null && <p className="error">{browseError}</p>}
          {browsedTotal !== null && (
            <p className="hint">
              {browsedTotal} match{browsedTotal === 1 ? "" : "es"} — pick up to 20:
            </p>
          )}
          {browsed.length > 0 && (
            <ul className="check-list">
              {browsed.map((problem) => (
                <li key={problem.id} className={picked.includes(problem.id) ? "good" : ""}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.includes(problem.id)}
                      onChange={() => togglePick(problem.id)}
                    />
                    {problem.title} ({problem.difficulty})
                  </label>
                </li>
              ))}
            </ul>
          )}
          {picked.length > 0 && <p className="hint">Picked: {picked.join(", ")}</p>}
        </>
      )}
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create & ready"}
        </button>
      </div>
      {error !== null && <p className="error">{error}</p>}
      <p className="hint">Use headphones — assistant audio leaking into the mic degrades turn detection.</p>
    </form>
  );
}
