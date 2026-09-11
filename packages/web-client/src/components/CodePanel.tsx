// HLD 4.4/6.x — candidate code panel (S7b).
//
// The Phase 6 sandbox made real: type code, submit it as backend-owned
// state (POST .../submissions), then execute it against caller-supplied
// cases (POST .../submissions/:id/runs). Runs persist server-side; verdicts
// render here and feed evaluation via the Results screen. Hidden cases
// report pass/fail only — the backend never stores hidden actuals, so there
// is nothing to leak.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type {
  CodeLanguage,
  SerializedRun,
  TestCaseInput,
} from "../api/types.js";
import { formatApiError } from "../state/use-interview.js";

export interface EditableCase {
  readonly name: string;
  readonly argsText: string;
  readonly expectedText: string;
  readonly hidden: boolean;
}

export const EMPTY_CASE: EditableCase = {
  name: "",
  argsText: "[]",
  expectedText: "null",
  hidden: false,
};

// Pure + tested: one editable row -> a backend test case, or a field error.
export function parseEditableCase(
  row: EditableCase,
  index: number,
): { ok: true; value: TestCaseInput } | { ok: false; error: string } {
  const name = row.name.trim() === "" ? `case_${index + 1}` : row.name.trim();
  let args: unknown;
  try {
    args = JSON.parse(row.argsText);
  } catch {
    return { ok: false, error: `case "${name}": args is not valid JSON` };
  }
  if (!Array.isArray(args)) {
    return { ok: false, error: `case "${name}": args must be a JSON array` };
  }
  let expected: unknown;
  try {
    expected = JSON.parse(row.expectedText);
  } catch {
    return { ok: false, error: `case "${name}": expected is not valid JSON` };
  }
  return {
    ok: true,
    value: { name, args, expected, hidden: row.hidden },
  };
}

export function formatRunSummary(run: SerializedRun): string {
  return `${run.status} ${run.passedCount}/${run.totalCount} in ${run.durationMs}ms`;
}

export function CodePanel({
  backend,
  interviewId,
  problemId,
  onActivity,
}: {
  backend: BackendClient;
  interviewId: string;
  problemId?: string;
  onActivity: (detail: string) => void;
}) {
  const [language, setLanguage] = useState<CodeLanguage>("python");
  const [code, setCode] = useState("");
  const [cases, setCases] = useState<readonly EditableCase[]>([EMPTY_CASE]);
  const [timeoutMs, setTimeoutMs] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [run, setRun] = useState<SerializedRun | null>(null);
  const [busy, setBusy] = useState<"submit" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setCase(index: number, next: EditableCase) {
    setCases((prev) => prev.map((row, i) => (i === index ? next : row)));
  }

  async function handleSubmit() {
    if (code.trim() === "") {
      setError("Write code before submitting.");
      return;
    }
    setBusy("submit");
    setError(null);
    try {
      const created = await backend.submitCode(interviewId, {
        language,
        code,
        ...(problemId === undefined ? {} : { problemId }),
      });
      setSubmissionId(created.id);
      setSubmissionCount((n) => n + 1);
      setRun(null);
      onActivity(`code submitted (${created.id.slice(0, 12)}…, ${language})`);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleRun() {
    if (submissionId === null) {
      setError("Submit code first, then run it.");
      return;
    }
    const parsed: TestCaseInput[] = [];
    for (let i = 0; i < cases.length; i += 1) {
      const row = cases[i];
      if (row === undefined) continue;
      const result = parseEditableCase(row, i);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      parsed.push(result.value);
    }
    if (parsed.length === 0) {
      setError("Add at least one test case.");
      return;
    }
    const timeout =
      timeoutMs.trim() === "" ? undefined : Number.parseInt(timeoutMs, 10);
    if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000)) {
      setError("Timeout must be 100–30000 ms (or blank for the 5s default).");
      return;
    }
    setBusy("run");
    setError(null);
    try {
      const executed = await backend.runSubmission(interviewId, submissionId, {
        testCases: parsed,
        ...(timeout === undefined ? {} : { timeoutMs: timeout }),
      });
      setRun(executed);
      onActivity(
        `code run ${formatRunSummary(executed)} (${executed.id.slice(0, 12)}…)`,
      );
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card" aria-label="Code sandbox">
      <div className="row space-between">
        <h3>Code sandbox</h3>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
          aria-label="Language"
        >
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
        </select>
      </div>
      <p className="hint">
        Candidate contract: define <code>solve(...)</code>. Submitted code is backend-owned state;
        runs execute server-side with a wall-clock timeout (local-dev runner).
      </p>
      <textarea
        className="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={language === "python" ? "def solve(a, b):\n    return a + b" : "function solve(a, b) {\n  return a + b;\n}"}
        spellCheck={false}
        rows={10}
        aria-label="Candidate code"
      />
      <div className="row actions">
        <button type="button" disabled={busy !== null} onClick={handleSubmit}>
          {busy === "submit" ? "Submitting…" : "Submit code"}
        </button>
        {submissionCount > 0 && (
          <span className="hint">
            {submissionCount} submission{submissionCount === 1 ? "" : "s"}
            {submissionId !== null ? ` · latest ${submissionId.slice(0, 12)}…` : ""}
          </span>
        )}
      </div>

      <h4>Test cases</h4>
      {cases.map((row, i) => (
        <div className="case-row" key={i}>
          <input
            value={row.name}
            onChange={(e) => setCase(i, { ...row, name: e.target.value })}
            placeholder={`case_${i + 1}`}
            aria-label={`Case ${i + 1} name`}
          />
          <input
            value={row.argsText}
            onChange={(e) => setCase(i, { ...row, argsText: e.target.value })}
            placeholder='args JSON, e.g. [2, 3]'
            aria-label={`Case ${i + 1} args JSON`}
          />
          <input
            value={row.expectedText}
            onChange={(e) => setCase(i, { ...row, expectedText: e.target.value })}
            placeholder="expected JSON, e.g. 5"
            aria-label={`Case ${i + 1} expected JSON`}
          />
          <label>
            <input
              type="checkbox"
              checked={row.hidden}
              onChange={(e) => setCase(i, { ...row, hidden: e.target.checked })}
            />
            hidden
          </label>
          <button
            type="button"
            onClick={() => setCases((prev) => prev.filter((_, j) => j !== i))}
            disabled={cases.length <= 1}
            aria-label={`Remove case ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="row actions">
        <button type="button" onClick={() => setCases((prev) => [...prev, EMPTY_CASE])}>
          Add case
        </button>
        <label>
          Timeout ms
          <input
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            placeholder="5000"
            inputMode="numeric"
          />
        </label>
        <button type="button" disabled={busy !== null || submissionId === null} onClick={handleRun}>
          {busy === "run" ? "Running…" : "Run tests"}
        </button>
      </div>

      {error !== null && <p className="error">{error}</p>}
      {run !== null && (
        <div aria-label="Run verdict">
          <p>
            <strong>{run.status}</strong> {run.passedCount}/{run.totalCount} in {run.durationMs}ms
          </p>
          <ul className="event-log">
            {run.results.map((result) => (
              <li key={result.name}>
                <span className="event-kind">{result.passed ? "pass" : "fail"}</span> {result.name}
                {result.hidden && " (hidden)"}
                {result.error !== undefined && result.error !== "" && ` — ${result.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
