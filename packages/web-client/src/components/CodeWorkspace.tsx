// H-Live right panel (ux-spec §9): a minimal code workspace.
//
// Language + editor + "Test code" (runs the candidate's code against the
// problem's sample test case) and "Submit" (asks the AI judge for a
// correctness/optimality verdict, persisted nowhere). No test-case editor —
// the sample case comes from the problem.

import { useEffect, useRef, useState } from "react";
import type * as monaco from "monaco-editor";
import type { BackendClient } from "../api/backend-client.js";
import type { CodeLanguage, Problem, ProblemStarterSet, SerializedRun, SerializedSubmitVerdict, TestCaseInput } from "../api/types.js";
import type { LiveCodeReader } from "../voice/session.js";
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
  codeReaderRef,
}: {
  readonly backend: BackendClient;
  readonly interviewId: string;
  readonly problem: Problem | null;
  /** 18c verbatim starters from the content endpoint. Prefills the editor
   *  while the candidate has not typed anything; never clobbers edits. */
  readonly starters?: ProblemStarterSet | null;
  readonly onActivity: (detail: string) => void;
  /** Optional holder for a live code reader: set to a getter over the
   *  current language/code refs so the voice tool can answer
   *  get_candidate_code locally. Cleared on unmount. */
  readonly codeReaderRef?: { current: LiveCodeReader | null };
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

  // Verbatim-starter prefill while untouched; refill on problem/language
  // change while untouched; never clobber edits.
  useEffect(() => {
    if (dirtyRef.current) return;    const starter = starterForLanguage(starters, language);
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
            const next = e.target.value as CodeLanguage;
            setLanguage(next);
            saveEditorLanguage(next);
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
        {!editorReady && <div className="note">Loading editor…</div>}
      </div>
      <div className="actions test-row" ref={actionsRef}>
        <PrimaryButton onClick={() => void testCode()} disabled={busy || sample === null}>
          {busy ? "Testing…" : "Test sample cases"}
        </PrimaryButton>
        <PrimaryButton onClick={() => void submitForVerdict()} disabled={busy || code.trim() === ""}>
          {busy ? "Submitting…" : "Submit for AI verdict"}
        </PrimaryButton>
        <span className="hint test-hint">
          {sample === null ? "No sample test case available for this problem." : "Runs your code against the sample test case."}
        </span>
      </div>
      {error !== null && <p className="error">{error}</p>}
      {verdict !== null && (
        <div className="verdict" aria-label="Submit verdict">
          <strong className={verdict.correctness === "correct" ? "accent-good" : "accent-warn"}>
            {verdict.correctness}
          </strong>
          <span className="hint"> · {verdict.optimality} optimality</span>
          {verdict.correctnessNotes !== "" && <p className="note">{verdict.correctnessNotes}</p>}
          {verdict.optimalityNotes !== "" && <p className="note">{verdict.optimalityNotes}</p>}
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
          {verdict.summary !== "" && <p className="note">{verdict.summary}</p>}
        </div>
      )}
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
      <p className="note test-note">Submit asks the AI judge for a correctness and optimality verdict and persists nothing. Runs execute in the isolated sandbox.</p>
    </section>
  );
}
