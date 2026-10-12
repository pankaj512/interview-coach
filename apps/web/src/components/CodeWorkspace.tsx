// Live-room code workspace.
//
// Owns: the editor plus Test (sample cases via the sandbox) and Submit
// (AI-judge verdict, persisted nowhere). No test-case editor: samples
// come from the problem.
//
// History: 17b; see docs/SESSION_HANDOFF.md.

import { useEffect, useRef, useState } from "react";
import type * as monaco from "monaco-editor";
import type { BackendClient } from "../api/backend-client.js";
import type { CodeLanguage, Problem, ProblemContent, ProblemStarterSet, SerializedRun, SerializedSubmitVerdict, SerializedTestResult, TestCaseInput } from "../api/types.js";
import type { LiveCodeReader } from "../voice/session.js";
import { buildVerdictPushSummary } from "../voice/session.js";
import { PrimaryButton } from "../ds/buttons.js";
import { formatApiError } from "../state/use-interview.js";
import { DEFAULT_EDITOR_LANGUAGE, loadEditorLanguage, saveEditorLanguage } from "./editor-prefs.js";

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Minimum editor height in px: the room's starting editor size. The
 *  container grows with content from here up to the measured viewport cap. */
export const EDITOR_MIN_HEIGHT = 480;

/** Clamp a measured Monaco content height into `[minHeight, maxHeight]`.
 *  A viewport smaller than the minimum pins the editor at the minimum (with
 *  Monaco's own scrollbar) instead of collapsing it. */
export function clampEditorHeight(
  contentHeight: number,
  maxHeight: number,
  minHeight: number = EDITOR_MIN_HEIGHT,
): number {
  const cap = Math.max(maxHeight, minHeight);
  return Math.min(Math.max(Math.ceil(contentHeight), minHeight), cap);
}

/** Size the Monaco container to its content while keeping the Test row in
 *  view: grown from `contentHeight`, capped by the viewport space below the
 *  editor's page offset minus the actions row. Past the cap Monaco scrolls
 *  internally (`automaticLayout` picks up the container resize). */
export function fitEditorHeight(container: HTMLDivElement, contentHeight: number, actionsHeight: number): void {
  const room = 32;
  const max = window.innerHeight - container.getBoundingClientRect().top - actionsHeight - room;
  container.style.height = `${clampEditorHeight(contentHeight, max)}px`;
}

/** Every problem example as a runner case (named `sample 1`, `sample 2`, ...
 *  to match the problem pane), or [] when none exists. */
export function sampleCasesFor(problem: Problem | ProblemContent | null): TestCaseInput[] {
  const examples = problem?.examples ?? [];
  return examples.map((example, i) => {
    const args = tryJson(example.input);
    return {
      name: `sample ${i + 1}`,
      args: Array.isArray(args) ? args : [args],
      expected: tryJson(example.output),
    };
  });
}

/** Render a case value (input/expected/actual) as compact text. */
export function formatCaseValue(value: unknown): string {
  if (value === undefined) return "-";
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

/** Render a case's args: a lone string arg (LeetCode-style raw input like
 *  `nums = [3,2,3]`) shows as itself instead of a one-element JSON array. */
export function formatCaseInput(args: readonly unknown[]): string {
  if (args.length === 1 && typeof args[0] === "string") return args[0];
  return formatCaseValue(args);
}

/** One sample-case row: the client-side sample joined with its run result. */
export interface SampleResultRow {
  readonly name: string;
  readonly input: string;
  readonly expected: string;
  readonly actual: string;
  readonly passed: boolean;
  readonly error?: string;
}

function toSampleRow(input: string, expected: string, result: SerializedTestResult): SampleResultRow {
  return {
    name: result.name,
    input,
    expected,
    actual: formatCaseValue(result.actual),
    passed: result.passed,
    ...(result.error === undefined || result.error === "" ? {} : { error: result.error }),
  };
}

/** Pair a run's results with the samples that produced them: match by case
 *  name (Test sends one case per example, `sample 1`, `sample 2`, ...). A lone
 *  sample still pairs with a lone result when names differ; results with no
 *  matching sample keep the run data with unknown input/expected, and samples
 *  with no result render with unknown actual, so the table never goes bare. */
export function sampleResultRows(samples: readonly TestCaseInput[], run: SerializedRun): SampleResultRow[] {
  if (run.results.length === 0) return [];
  const loneFallback = samples.length === 1 && run.results.length === 1;
  const sampleByName = new Map(samples.map((sample) => [sample.name, sample]));
  const rows = samples.map((sample) => {
    const input = formatCaseInput(sample.args);
    const expected = formatCaseValue(sample.expected);
    const match =
      run.results.find((result) => result.name === sample.name) ??
      (loneFallback ? run.results[0] : undefined);
    if (match === undefined) {
      return { name: sample.name, input, expected, actual: "-", passed: false };
    }
    return toSampleRow(input, expected, match);
  });
  if (!loneFallback) {
    for (const result of run.results) {
      if (!sampleByName.has(result.name)) rows.push(toSampleRow("-", "-", result));
    }
  }
  return rows;
}

/** Saved per-language buffers: the outgoing language keeps the code being
 *  replaced so switching back restores it. */
export type SavedCodeByLanguage = Partial<Record<CodeLanguage, string>>;

/** Language switch in one place: stash the outgoing code, resolve the
 *  incoming code (saved buffer, else starter, else empty). Pure for tests. */
export function switchLanguageCode(
  saved: SavedCodeByLanguage,
  starters: ProblemStarterSet | null | undefined,
  from: CodeLanguage,
  to: CodeLanguage,
  currentCode: string,
): { saved: SavedCodeByLanguage; code: string } {
  if (from === to) return { saved, code: currentCode };
  return {
    saved: { ...saved, [from]: currentCode },
    code: saved[to] ?? starters?.[to] ?? "",
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
  codeReaderRef,
  pushVerdictSummary,
}: {
  readonly backend: BackendClient;
  readonly interviewId: string;
  readonly problem: Problem | ProblemContent | null;
  /** 18c verbatim starters from the content endpoint. Prefills the editor
   *  while the candidate has not typed anything; never clobbers edits. */
  readonly starters?: ProblemStarterSet | null;
  readonly onActivity: (detail: string) => void;
  /** Optional holder for a live code reader: set to a getter over the
   *  current language/code refs so the voice tool can answer
   *  get_candidate_code locally. Cleared on unmount. */
  readonly codeReaderRef?: { current: LiveCodeReader | null };
  /** Fix B push: best-effort verdict summary into the live session after a
   *  successful Submit. False (not connected) is ignored. */
  readonly pushVerdictSummary?: (summary: string) => boolean;
}) {
  const [language, setLanguage] = useState<CodeLanguage>(() => loadEditorLanguage() ?? DEFAULT_EDITOR_LANGUAGE);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<SerializedRun | null>(null);
  const [verdict, setVerdict] = useState<SerializedSubmitVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const dirtyRef = useRef(false);
  // True while pushing starter/prefill text into Monaco so the change
  // listener does not mistake it for a candidate edit.
  const suppressRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  // Last measured Monaco content height; drives viewport-capped auto-grow.
  const contentHeightRef = useRef(EDITOR_MIN_HEIGHT);
  const codeRef = useRef(code);
  codeRef.current = code;
  const languageRef = useRef(language);
  languageRef.current = language;
  const startersRef = useRef(starters);
  startersRef.current = starters;
  // One saved buffer per language, seeded from starters; the select swaps
  // these instead of dropping the outgoing language's code.
  const savedCodeRef = useRef<SavedCodeByLanguage>({});

  function pushValue(editor: monaco.editor.IStandaloneCodeEditor, value: string): void {
    suppressRef.current = true;
    try {
      editor.setValue(value);
    } finally {
      suppressRef.current = false;
    }
    setCode(value);
  }

  // Create the Monaco editor once (client-only dynamic import, per the
  // official browser-esm-vite-react sample). Disposal makes StrictMode
  // dev double-mounts and unmounts safe.
  useEffect(() => {
    let cancelled = false;
    let editor: monaco.editor.IStandaloneCodeEditor | null = null;
    // Auto-grow: resize the container to the content, capped so the Test
    // row stays in view; past the cap Monaco scrolls internally.
    const fit = () => {
      const container = containerRef.current;
      if (container === null || editor === null) return;
      fitEditorHeight(container, contentHeightRef.current, actionsRef.current?.offsetHeight ?? 56);
    };
    (async () => {
      await import("./monaco-setup.js");
      if (cancelled || containerRef.current === null) return;
      const created = await import("monaco-editor");
      if (cancelled || containerRef.current === null) return;
      monacoRef.current = created;
      editor = created.editor.create(containerRef.current, {
        value: codeRef.current,
        language: languageRef.current,
        theme: "vs-dark",
        tabSize: 4,
        insertSpaces: true,
        autoClosingBrackets: "always",
        autoIndent: "full",
        tabCompletion: "on",
        wordBasedSuggestions: "currentDocument",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        // Narrowing the room wraps code instead of opening the editor's
        // horizontal scrollbar; the pane keeps its own vertical scroll.
        wordWrap: "on",
        fontSize: 13,
        automaticLayout: true,
      });
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        if (suppressRef.current || editor === null) return;
        dirtyRef.current = true;
        setCode(editor.getValue());
      });
      // Auto-grow wiring (fit is effect-scoped so cleanup can unbind it).
      editor.onDidContentSizeChange((e) => {
        contentHeightRef.current = e.contentHeight;
        fit();
      });
      window.addEventListener("resize", fit);
      fit();
      // Apply the starter that may have arrived before Monaco finished
      // loading; never clobber candidate edits.
      if (!dirtyRef.current) {
        const starter = starterForLanguage(startersRef.current, languageRef.current);
        if (starter !== null && starter !== editor.getValue()) pushValue(editor, starter);
      }
      setEditorReady(true);
    })().catch(() => {
      // Editor creation failed (e.g. workers blocked): the Test path below
      // still works from `code` state, so surface nothing extra here.
    });
    return () => {
      cancelled = true;
      window.removeEventListener("resize", fit);
      editorRef.current?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  // Expose the live editor content to the voice tool path. The getter
  // reads the refs (not state) so it stays fresh without re-registering.
  useEffect(() => {
    if (codeReaderRef === undefined) return;
    codeReaderRef.current = () => ({ language: languageRef.current, code: codeRef.current });
    return () => {
      codeReaderRef.current = null;
    };
  }, [codeReaderRef]);

  // A new problem starts with fresh buffers so the previous problem's code
  // can never leak into its language slots.
  useEffect(() => {
    savedCodeRef.current = {};
  }, [problem?.id]);

  // Seed one buffer per language as soon as starters arrive; never overwrite
  // a buffer the candidate already saved by switching. The visible language
  // still loads through the prefill effect / changeLanguage below.
  useEffect(() => {
    if (starters === null || starters === undefined) return;
    const saved = savedCodeRef.current;
    for (const lang of ["python", "javascript", "cpp"] as const) {
      if (saved[lang] === undefined && starters[lang] !== undefined) {
        saved[lang] = starters[lang];
      }
    }
  }, [starters]);

  // Verbatim-starter prefill while untouched; refill on problem/language
  // change while untouched; never clobber edits.
  useEffect(() => {
    if (dirtyRef.current) return;
    const starter = starterForLanguage(starters, language);
    if (starter === null) return;
    const editor = editorRef.current;
    if (editor !== null && editor.getValue() !== starter) pushValue(editor, starter);
    else if (editor === null && codeRef.current !== starter) setCode(starter);
  }, [starters, language, problem?.id]);

  // Keep the model language in sync with the selector.
  useEffect(() => {
    const editor = editorRef.current;
    const monacoNs = monacoRef.current;
    if (editor === null || monacoNs === null) return;
    const model = editor.getModel();
    if (model !== null) monacoNs.editor.setModelLanguage(model, language);
  }, [language]);

  // Explicit language switch: stash the outgoing code, load the incoming
  // language's buffer (or its starter on first visit). Runs through
  // pushValue so the swap never marks edits; dirtyRef is left untouched.
  function changeLanguage(next: CodeLanguage): void {
    const { saved, code: nextCode } = switchLanguageCode(
      savedCodeRef.current,
      startersRef.current,
      languageRef.current,
      next,
      codeRef.current,
    );
    savedCodeRef.current = saved;
    const editor = editorRef.current;
    if (editor !== null) pushValue(editor, nextCode);
    else setCode(nextCode);
    setLanguage(next);
    saveEditorLanguage(next);
  }

  const samples = sampleCasesFor(problem);
  const sampleHint =
    samples.length === 0
      ? "No sample cases are available for this problem, so there is nothing to run."
      : "Runs your code against the sample test cases in the isolated sandbox.";
  const reviewHint =
    "Asks the AI judge for a correctness and optimality verdict and saves your code as a submission.";

  async function testCode() {
    if (samples.length === 0) return;
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
        testCases: samples,
      });
      setRun(executed);
      onActivity(`sample test ${executed.status} (${executed.passedCount}/${executed.totalCount})`);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitForVerdict() {
    if (code.trim() === "") {
      setError("Write code before submitting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await backend.submitVerdict(interviewId, {
        language,
        code,
        ...(problem === null ? {} : { problemId: problem.id }),
      });
      setVerdict(result);
      onActivity(`submit verdict ${result.correctness}/${result.optimality}`);
      pushVerdictSummary?.(buildVerdictPushSummary(result));
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
          onChange={(e) => {
            changeLanguage(e.target.value as CodeLanguage);
          }}
          aria-label="Language"
        >
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="cpp">C++</option>
        </select>
        <span className="note">boilerplate provided per problem</span>
      </div>
      <div className="code-editor" aria-label="Candidate code" ref={containerRef}>
        {!editorReady && <div className="note">Loading editor...</div>}
      </div>
      <div className="actions test-row" ref={actionsRef}>
        <PrimaryButton onClick={() => void testCode()} disabled={busy || samples.length === 0}>
          {busy ? "Testing..." : "Test"}
          <span className="info-icon" data-tip={sampleHint} aria-label={sampleHint}>
            i
          </span>
        </PrimaryButton>
        <PrimaryButton onClick={() => void submitForVerdict()} disabled={busy || code.trim() === ""}>
          {busy ? "Submitting..." : "Submit for Review"}
          <span className="info-icon" data-tip={reviewHint} aria-label={reviewHint}>
            i
          </span>
        </PrimaryButton>
      </div>
      {error !== null && <p className="error">{error}</p>}
      <div className="verdict">
        <h4 className="result-heading">Sample tests</h4>
          {run === null ? (
            <p className="note">Run the sample cases to see per-case input, expected, actual, and pass/fail here.</p>
          ) : (
            <>
              <strong className={run.status === "passed" ? "accent-good" : "accent-warn"}>
                {run.totalCount === 0
                  ? `${run.status} - no cases executed`
                  : run.passedCount === run.totalCount
                    ? `${run.passedCount} passed of ${run.totalCount}`
                    : `${run.passedCount} passed · ${run.totalCount - run.passedCount} failed of ${run.totalCount}`}
              </strong>
              <span className="hint"> in {run.durationMs}ms</span>
              {run.results.length === 0 ? (
                <p className="note">The run could not execute - no case results were returned. See the error above.</p>
              ) : (
                <table className="case-table" aria-label="Sample case results">
                  <thead>
                    <tr>
                      <th scope="col">Case</th>
                      <th scope="col">Input</th>
                      <th scope="col">Expected</th>
                      <th scope="col">Actual</th>
                      <th scope="col">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleResultRows(samples, run).map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td className="mono">{row.input}</td>
                        <td className="mono">{row.expected}</td>
                        <td className="mono">{row.actual}</td>
                        <td>
                          <span className={row.passed ? "accent-good" : "accent-warn"}>
                            {row.passed ? "pass" : "fail"}
                          </span>
                          {row.error !== undefined && <span className="note"> - {row.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      <div className="verdict">
        <h4 className="result-heading">AI review</h4>
      {verdict === null ? (
        <p className="note">Submit your code for review to see the AI judge&apos;s correctness and optimality verdict here.</p>
      ) : (
        <div aria-label="Review">
          <strong className={verdict.correctness === "correct" ? "accent-good" : "accent-warn"}>
            {verdict.correctness}
          </strong>
          <span className="hint"> · {verdict.optimality} optimality</span>
          {verdict.correctnessNotes !== "" && (
            <p className="note"><strong>Correctness</strong> - {verdict.correctnessNotes}</p>
          )}
          {verdict.optimalityNotes !== "" && (
            <p className="note"><strong>Optimality</strong> - {verdict.optimalityNotes}</p>
          )}
          {verdict.breakPoints.length > 0 && (
            <>
              <strong>Break-points</strong>
              <ul className="event-log">
                {verdict.breakPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </>
          )}
          {verdict.edgeCases.length > 0 && (
            <>
              <strong>Edge cases</strong>
              <ul className="event-log">
                {verdict.edgeCases.map((edge) => (
                  <li key={edge}>{edge}</li>
                ))}
              </ul>
            </>
          )}
          {verdict.summary !== "" && (
            <p className="note"><strong>Summary</strong> - {verdict.summary}</p>
          )}
        </div>
      )}
      </div>
    </section>
  );
}
