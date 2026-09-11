// HLD 4.3 — canonical problem display (S4).
//
// Read-only view of backend-owned problem state (from GET .../state). The
// client never invents problem content; when no problem is attached the panel
// says so instead of guessing.

import type { SerializedStateSnapshot } from "../api/types.js";

export function ProblemPanel({ snapshot }: { snapshot: SerializedStateSnapshot | null }) {
  if (snapshot === null) {
    return (
      <section className="card">
        <h3>Problem</h3>
        <p className="hint">Loading interview state…</p>
      </section>
    );
  }
  const problem = snapshot.currentProblem;
  if (problem === null) {
    return (
      <section className="card">
        <h3>Problem</h3>
        <p className="hint">
          No problem attached yet. Ask the interviewer for one, or attach problem ids on the setup screen.
        </p>
        <p className="hint">Responses so far: {snapshot.responseCount}</p>
      </section>
    );
  }
  return (
    <section className="card">
      <h3>
        {problem.title} <span className="badge">{problem.difficulty}</span>
      </h3>
      {problem.description !== undefined && problem.description !== "" && <p className="problem-desc">{problem.description}</p>}
      {problem.constraints !== undefined && problem.constraints.length > 0 && (
        <>
          <h4>Constraints</h4>
          <ul>
            {problem.constraints.map((constraint, i) => (
              <li key={i}>{constraint}</li>
            ))}
          </ul>
        </>
      )}
      {problem.examples !== undefined && problem.examples.length > 0 && (
        <>
          <h4>Examples</h4>
          <pre>{JSON.stringify(problem.examples, null, 2)}</pre>
        </>
      )}
      <p className="hint">Responses so far: {snapshot.responseCount}</p>
    </section>
  );
}
