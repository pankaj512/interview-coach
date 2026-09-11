// HLD 4.4 — coding workspace placeholder (S4).
//
// S4 scope is a local scratchpad only: typed code never leaves the browser
// and is never executed. Sandboxed execution + submission arrive with Phase 6
// (HLD 6.x) — this panel must not imply otherwise.

import { useState } from "react";

export function CodeEditor() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const lines = code === "" ? 0 : code.split("\n").length;

  return (
    <section className="card">
      <div className="row space-between">
        <h3>Coding scratchpad</h3>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
          <option value="javascript">JavaScript</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>
      </div>
      <textarea
        className="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="# Think aloud, sketch your approach here…"
        spellCheck={false}
        rows={14}
      />
      <p className="hint">
        {lines} lines · Local only — nothing is sent or executed. Sandboxed run &amp; submit land in Phase 6.
      </p>
    </section>
  );
}
