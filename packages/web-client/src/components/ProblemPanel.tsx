// H-Live left panel (feature 17b): the canonical problem on the approved
// prototype look. Read-only view of backend-owned problem state: title,
// difficulty, description, constraints, and the sample test case. The
// client never invents problem content; empty sections say so explicitly.
// Title-only until item 18 (no statement enrichment here).

import type { Problem, SerializedStateSnapshot } from "../api/types.js";

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
      <section className="card" aria-label="Problem">
        <h2>Problem</h2>
        <p className="note">
          {snapshot === null ? "Loading interview state…" : "No problem attached yet."}
        </p>
      </section>
    );
  }
  const example = problem.examples?.[0];
  return (
    <section className="card" aria-label="Problem">
      <span className="chip">{problem.difficulty}</span>
      <h2>{problem.title}</h2>
      <p className="note">MVP shows the title; full statement arrives via problem-URL lookup (item 18).</p>
      {problem.description !== undefined && problem.description !== "" ? (
        <p>{problem.description}</p>
      ) : (
        <p className="note">No description available for this problem yet.</p>
      )}
      {problem.constraints !== undefined && problem.constraints.length > 0 && (
        <>
          <h3 className="subhead">Constraints</h3>
          <ul className="tight">
            {problem.constraints.map((constraint, i) => (
              <li key={i}>{constraint}</li>
            ))}
          </ul>
        </>
      )}
      <h3 className="subhead">Sample test case</h3>
      {example !== undefined ? (
        <table className="cases">
          <thead>
            <tr>
              <th>Case</th>
              <th>Input</th>
              <th>Expected</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>sample</td>
              <td>{example.input}</td>
              <td>{example.output}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="note">No sample test case available for this problem yet.</p>
      )}
    </section>
  );
}
