// H-Live left panel (ux-spec §9/§11): the canonical problem.
//
// Read-only view of backend-owned problem state: title, difficulty,
// description, constraints, and the sample test case. The client never
// invents problem content; empty sections say so explicitly.

import type { Problem, SerializedStateSnapshot } from "../api/types.js";
import { DiffPill } from "../ds/status.js";

export function ProblemPanel({
  snapshot,
  fallbackProblem = null,
}: {
  snapshot: SerializedStateSnapshot | null;
  /** Phase 7: the recommendation-driven problem carried by the Lobby, shown
   *  immediately while the first state snapshot is still loading. */
  fallbackProblem?: Problem | null;
}) {
  const problem = snapshot?.currentProblem ?? fallbackProblem;
  if (problem === null) {
    return (
      <section className="card problem-panel">
        <h3>Problem</h3>
        <p className="hint">
          {snapshot === null ? "Loading interview state…" : "No problem attached yet."}
        </p>
      </section>
    );
  }
  const example = problem.examples?.[0];
  return (
    <section className="card problem-panel" aria-label="Problem">
      <div className="problem-head">
        <h3>{problem.title}</h3>
        <DiffPill level={problem.difficulty} />
      </div>
      {problem.description !== undefined && problem.description !== "" ? (
        <p className="problem-desc">{problem.description}</p>
      ) : (
        <p className="hint">No description available for this problem yet.</p>
      )}
      {problem.constraints !== undefined && problem.constraints.length > 0 && (
        <>
          <h4 className="problem-subhead">Constraints</h4>
          <ul className="plain-list">
            {problem.constraints.map((constraint, i) => (
              <li key={i}>• {constraint}</li>
            ))}
          </ul>
        </>
      )}
      <h4 className="problem-subhead">Sample test case</h4>
      {example !== undefined ? (
        <div className="sample-case">
          <div>
            <span className="sample-label">Input:</span>
            <code>{example.input}</code>
          </div>
          <div>
            <span className="sample-label">Output:</span>
            <code>{example.output}</code>
          </div>
          {example.explanation !== undefined && example.explanation !== "" && (
            <div>
              <span className="sample-label">Explanation:</span>
              <span className="hint">{example.explanation}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="hint">No sample test case available for this problem yet.</p>
      )}
    </section>
  );
}
