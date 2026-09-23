// H-Live right panel (ux-spec §9): a minimal code workspace.
//
// Language + editor + a single "Test code" action that runs the candidate's
// code against the problem's sample test case. No submit button and no
// test-case editor — the sample case comes from the problem.

import { useEffect, useRef, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { CodeLanguage, Problem, ProblemStarterSet, SerializedRun, TestCaseInput } from "../api/types.js";
import { PrimaryButton } from "../ds/buttons.js";
import { formatApiError } from "../state/use-interview.js";

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** First problem example as a runner case, or null when none exists. */
export function sampleCaseFor(problem: Problem | null): TestCaseInput | null {
  const example = problem?.examples?.[0];
  if (example === undefined) return null;
  const args = tryJson(example.input);
  return {
    name: "sample",
    args: Array.isArray(args) ? args : [args],
    expected: tryJson(example.output),
  };
}

/** Verbatim starter for the active language, or null when the problem is a
 *  title-only gap (or content has not loaded yet). */
export function starterForLanguage(
  starters: ProblemStarterSet | null | undefined,
  language: CodeLanguage,
): string | null {
  if (starters === null || starters === undefined) return null;
  return starters[language];
}

export function CodeWorkspace({
  backend,
  interviewId,
  problem,
  starters = null,
  onActivity,
}: {
  readonly backend: BackendClient;
  readonly interviewId: string;
  readonly problem: Problem | null;
  /** 18c verbatim starters from the content endpoint. Prefills the editor
   *  while the candidate has not typed anything; never clobbers edits. */
  readonly starters?: ProblemStarterSet | null;
  readonly onActivity: (detail: string) => void;
}) {
  const [language, setLanguage] = useState<CodeLanguage>("python");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<SerializedRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    const starter = starterForLanguage(starters, language);
    if (starter !== null) setCode(starter);
  }, [starters, language, problem?.id]);

  const sample = sampleCaseFor(problem);
  const placeholder =
    language === "python"
      ? "def solve(nums, target):\n    return []"
      : language === "cpp"
        ? "Value solve(Value a, Value b) {\n  return a;\n}"
        : "function solve(nums, target) {\n  return [];\n}";

  async function testCode() {
    if (sample === null) return;
    if (code.trim() === "") {
      setError("Write code before testing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const submission = await backend.submitCode(interviewId, {
        language,
        code,
        ...(problem === null ? {} : { problemId: problem.id }),
      });
      const executed = await backend.runSubmission(interviewId, submission.id, {
        testCases: [sample],
      });
      setRun(executed);
      onActivity(`sample test ${executed.status} (${executed.passedCount}/${executed.totalCount})`);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="Code editor">
      <div className="editorbar">
        <strong>Editor</strong>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
          aria-label="Language"
        >
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="cpp">C++</option>
        </select>
        <span className="note">boilerplate provided per problem</span>
      </div>
      <textarea
        className="code"
        value={code}
        onChange={(e) => {
          dirtyRef.current = true;
          setCode(e.target.value);
        }}
        placeholder={placeholder}
        spellCheck={false}
        aria-label="Candidate code"
      />
      <div className="actions">
        <PrimaryButton onClick={() => void testCode()} disabled={busy || sample === null}>
          {busy ? "Testing…" : "Test sample cases"}
        </PrimaryButton>
        <span className="hint">
          {sample === null ? "No sample test case available for this problem." : "Runs your code against the sample test case."}
        </span>
      </div>
      {error !== null && <p className="error">{error}</p>}
      {run !== null && (
        <div className="verdict" aria-label="Sample verdict">
          <strong className={run.status === "passed" ? "accent-good" : "accent-warn"}>
            {run.status} {run.passedCount}/{run.totalCount}
          </strong>
          <span className="hint"> in {run.durationMs}ms</span>
          <ul className="event-log">
            {run.results.map((result) => (
              <li key={result.name}>
                <span className="event-kind">{result.passed ? "pass" : "fail"}</span> {result.name}
                {result.error !== undefined && result.error !== "" && ` — ${result.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="note">No Submit button: the interviewer reads the code and judges correctness in conversation. Runs execute in the isolated sandbox.</p>
    </section>
  );
}
