// H-Live right panel (ux-spec §9): a minimal code workspace.
//
// Language + editor + a single "Test code" action that runs the candidate's
// code against the problem's sample test case. No submit button and no
// test-case editor — the sample case comes from the problem.

import { useEffect, useRef, useState } from "react";
import type * as monaco from "monaco-editor";
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
  const [editorReady, setEditorReady] = useState(false);
  const dirtyRef = useRef(false);
  // True while pushing starter/prefill text into Monaco so the change
  // listener does not mistake it for a candidate edit.
  const suppressRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  const languageRef = useRef(language);
  languageRef.current = language;
  const startersRef = useRef(starters);
  startersRef.current = starters;

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
        fontSize: 13,
        automaticLayout: true,
      });
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        if (suppressRef.current || editor === null) return;
        dirtyRef.current = true;
        setCode(editor.getValue());
      });
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
      editorRef.current?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

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

  const sample = sampleCaseFor(problem);

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
      <div className="code-editor" aria-label="Candidate code" ref={containerRef}>
        {!editorReady && <div className="note">Loading editor…</div>}
      </div>
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
