// Live-room problem pane.
//
// Owns: the read-only problem view (title, difficulty, statement,
// constraints, samples). The client never invents content; empty
// sections say so, and snapshot fields render under the content slice.
//
// History: 17b, 18c; see docs/SESSION_HANDOFF.md.

import type { ProblemContent, SerializedStateSnapshot } from "../api/types.js";
import { Fragment } from "react";
import { splitStatement } from "./problem-statement.js";

export function ProblemPanel({
  snapshot,
  fallbackProblem = null,
  content,
}: {
  snapshot: SerializedStateSnapshot | null;
  /** Phase 7: the recommendation-driven problem carried by the Lobby, shown
   *  immediately while the first state snapshot is still loading. */
  fallbackProblem?: ProblemContent | null;
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
          {snapshot === null ? "Loading interview state..." : "No problem attached yet."}
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
        splitStatement(description).map((block, i) =>
          block.kind === "code" ? (
            <pre key={i}>
              <code>{block.text}</code>
            </pre>
          ) : (
            <p key={i}>{block.text}</p>
          ),
        )
      ) : (
        <p className="note">
          {loadingContent ? "Loading full statement..." : "No description available for this problem yet."}
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
              <Fragment key={i}>
                <tr>
                  <td>{`sample ${i + 1}`}</td>
                  <td>{example.input}</td>
                  <td>{example.output}</td>
                </tr>
                {example.explanation !== undefined && example.explanation !== "" && (
                  <tr>
                    <td colSpan={3} className="note">
                      {`Sample ${i + 1}: ${example.explanation}`}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="note">No sample test case available for this problem yet.</p>
      )}
    </section>
  );
}
