// H-Setup — config wizard, step 1 (HLD 4.1, ux-spec §1/§2).
//
// type/difficulty/duration/topic focus → Continue (devices gate).
// Backend owns truth: this screen creates + readies the interview, then
// hands off. Validation before any backend call is client-side selection
// state (per spec §2).

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { InterviewConfiguration, Problem, SerializedInterview } from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { formatApiError, useBackendClient, useInterviewSetup } from "../state/use-interview.js";

type Difficulty = "Easy" | "Medium" | "Mixed";

export function SetupScreen({
  onCreated,
  onHistory,
}: {
  readonly onCreated: (interview: SerializedInterview) => void;
  readonly onHistory: () => void;
}) {
  const backend: BackendClient = useBackendClient();
  const { setup, busy, error } = useInterviewSetup(backend);
  const [candidateId, setCandidateId] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Easy");
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

  const manualIds = picked.length > 0
    ? picked
    : problemIdsRaw.split(/[\s,]+/).map((id) => id.trim()).filter((id) => id !== "");

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
    const topics = topicFocus.split(",").map((t) => t.trim()).filter((t) => t !== "");
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
      onCreated(interview);
    } catch {
      // error surfaces via the hook
    }
  }

  const difficulties: readonly Difficulty[] = ["Easy", "Medium", "Mixed"];

  return (
    <div className="screen screen-setup">
      <header className="topbar topbar-pre">
        <span className="brand">Interview Coach</span>
        <span className="spacer" />
        <GhostButton onClick={onHistory}>History</GhostButton>
      </header>
      <p className="eyebrow">Setup · Step 1 of 2</p>
      <h2 className="screen-title">Configure your interview</h2>
      <form className="card setup-card" onSubmit={submit}>
        <div className="format-row" role="group" aria-label="Interview format">
          <div className="format-card format-selected" aria-current="true">
            <strong>DSA voice interview</strong>
            <span>Realtime conversation + problem + editor</span>
          </div>
          <div className="format-card format-disabled" aria-disabled="true">
            <strong>System design</strong>
            <span>Soon — DSA only in this build</span>
          </div>
        </div>
        <label className="field">
          Candidate id
          <input value={candidateId} onChange={(e) => setCandidateId(e.target.value)} placeholder="candidate" maxLength={200} />
        </label>
        <fieldset className="field">
          <legend>Difficulty</legend>
          <div className="pill-row" role="group" aria-label="Difficulty">
            {difficulties.map((level) => (
              <button
                key={level}
                type="button"
                className={difficulty === level ? "pill pill-selected" : "pill"}
                aria-pressed={difficulty === level}
                onClick={() => setDifficulty(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <label className="field">
            Duration (min)
            <input value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} inputMode="numeric" placeholder="30" />
          </label>
          <label className="field">
            Problems
            <input value={problemCount} onChange={(e) => setProblemCount(e.target.value)} inputMode="numeric" placeholder="1" />
          </label>
        </div>
        <label className="field">
          Topic focus (optional, comma separated)
          <input value={topicFocus} onChange={(e) => setTopicFocus(e.target.value)} placeholder="Arrays, Two Pointers" />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={autoSelect} onChange={(e) => setAutoSelect(e.target.checked)} />
          Auto-select problems from configuration (deterministic)
        </label>
        {!autoSelect && (
          <>
            <label className="field">
              Problem ids (optional, comma/space separated — e.g. prob_3sum)
              <input value={problemIdsRaw} onChange={(e) => setProblemIdsRaw(e.target.value)} placeholder="prob_3sum" spellCheck={false} />
            </label>
            <div className="row">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search problems…" aria-label="Search problems" />
              <select value={browseDifficulty} onChange={(e) => setBrowseDifficulty(e.target.value as "" | "Easy" | "Medium" | "Hard")} aria-label="Filter by difficulty">
                <option value="">Any difficulty</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
              <button type="button" className="btn-ghost" disabled={browsing} onClick={browse}>
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
                    <label className="check-row">
                      <input type="checkbox" checked={picked.includes(problem.id)} onChange={() => togglePick(problem.id)} />
                      {problem.title} ({problem.difficulty})
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {picked.length > 0 && <p className="hint">Picked: {picked.join(", ")}</p>}
          </>
        )}
        <div className="row actions">
          <PrimaryButton type="submit" disabled={busy} autoFocus>
            {busy ? "Creating…" : "Continue"}
          </PrimaryButton>
        </div>
        {error !== null && <p className="error">{error}</p>}
        <p className="hint">Use headphones — assistant audio leaking into the mic degrades turn detection.</p>
      </form>
    </div>
  );
}
