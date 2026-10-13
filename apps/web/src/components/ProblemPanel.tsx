// Live-room problem pane.
//
// Owns: the read-only problem view (title, difficulty, statement,
// constraints, samples). The client never invents content; empty
// sections say so, and snapshot fields render under the content slice.
//
// History: 17b, 18c; see docs/SESSION_HANDOFF.md.

import type { ProblemContent, SerializedStateSnapshot } from "../api/types.js";
import DOMPurify from "isomorphic-dompurify";
import { isHtmlDescription, splitStatement } from "./problem-statement.js";

/** Sanitize third-party LeetCode HTML before injection: content tags
 *  (incl. img) render as authored; scripts, forms, event handlers, and
 *  LeetCode's class/style/id cruft are stripped. */
export function sanitizeDescriptionHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      "style",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "option",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "base",
    ],
    FORBID_ATTR: ["class", "style", "id"],
  });
}

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
        isHtmlDescription(description) ? (
          // Fetched LeetCode HTML, sanitized above.
          <div className="statement-html" dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(description) }} />
        ) : (
          splitStatement(description).map((block, i) =>
            block.kind === "code" ? (
              <pre key={i}>
                <code>{block.text}</code>
              </pre>
            ) : (
              <p key={i}>{block.text}</p>
            ),
          )
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
        <ol className="example-list">
          {examples.map((example, i) => (
            <li key={i} className="example">
              <h4 className="example-title">{`Example ${i + 1}`}</h4>
              <p className="example-label">Input</p>
              <pre className="example-io">{example.input}</pre>
              <p className="example-label">Output</p>
              <pre className="example-io">{example.output}</pre>
              {example.explanation !== undefined && example.explanation !== "" && (
                <>
                  <p className="example-label">Explanation</p>
                  <p className="example-text">{example.explanation}</p>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="note">No sample test case available for this problem yet.</p>
      )}
    </section>
  );
}
