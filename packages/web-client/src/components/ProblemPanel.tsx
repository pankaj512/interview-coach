// H-Live left panel (feature 17b): the canonical problem on the approved
// prototype look. Read-only view of backend-owned problem state: title,
// difficulty, description, constraints, and the sample test cases. The
// client never invents problem content; empty sections say so explicitly.
// Statement enrichment arrives via the 18c content endpoint (the `content`
// prop); snapshot/fallback fields render immediately underneath.

import type { Problem, ProblemContent, SerializedStateSnapshot } from "../api/types.js";

export function ProblemPanel({
  snapshot,
  fallbackProblem = null,
  content,
}: {
  snapshot: SerializedStateSnapshot | null;
  /** Phase 7: the recommendation-driven problem carried by the Lobby, shown
   *  immediately while the first state snapshot is still loading. */
  fallbackProblem?: Problem | null;
  /** 18c content slice. `undefined` = still loading, `null` = fetch failed
   *  (snapshot fields render alone), object = ready (null fields inside the
   *  object mark a title-only gap problem). */
  content?: ProblemContent | null | undefined;
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
  const description = content?.description ?? problem.description;
  const constraints = content?.constraints ?? problem.constraints;
  const examples = content?.examples ?? problem.examples;
  const loadingContent = content === undefined;
  return (
    <section className="card" aria-label="Problem">
      <span className="chip">{problem.difficulty}</span>
      <h2>{problem.title}</h2>
      {description !== undefined && description !== null && description !== "" ? (
        <p>{description}</p>
      ) : (
        <p className="note">
          {loadingContent ? "Loading full statement…" : "No description available for this problem yet."}
        </p>
      )}
      {constraints !== undefined && constraints !== null && constraints.length > 0 && (
        <>
          <h3 className="subhead">Constraints</h3>
          <ul className="tight">
            {constraints.map((constraint, i) => (
              <li key={i}>{constraint}</li>
            ))}
          </ul>
        </>
      )}
      <h3 className="subhead">Sample test cases</h3>
      {examples !== undefined && examples !== null && examples.length > 0 ? (
        <table className="cases">
          <thead>
            <tr>
              <th>Case</th>
              <th>Input</th>
              <th>Expected</th>
            </tr>
          </thead>
          <tbody>
            {examples.map((example, i) => (
              <tr key={i}>
                <td>{`sample ${i + 1}`}</td>
                <td>{example.input}</td>
                <td>{example.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="note">No sample test case available for this problem yet.</p>
      )}
    </section>
  );
}
