// @interview-coach/api - Python shape-runner assembly.
//
// Owns: building the per-run files for a linked problem (candidate
// Solution code with mechanical empty-body repair, baked shape runner,
// shared helpers).
//
// History: 18a.1; see docs/SESSION_HANDOFF.md.

import { readFileSync } from "node:fs";

export type PythonActualRule = "pure" | "in-place" | "method-sequence";

export interface PythonLink {
  /** `shape-NNN` for shared shapes, `method-sequence` for design classes. */
  readonly runnerId: string;
  /** Entry method baked into pure/in-place runners; unused for method-sequence. */
  readonly entry: string;
  /** `Solution` or the design-class name (`MyHashMap`, `Codec`, ...). */
  readonly className: string;
  readonly actualRule: PythonActualRule;
}

export interface AssembledPythonRun {
  /** `submission.py`, `runner.py`, `nodes.py`, `samples.py` sources. */
  readonly files: Record<string, string>;
}

const CLASS_TOKEN = "__CLASS__";
const ENTRY_TOKEN = "__ENTRY__";

/**
 * Insert `pass` into empty `def`/`class` bodies. Cached starters are
 * truncated stubs whose bodies are blank whitespace, which is a Python
 * SyntaxError; signatures and annotations are intact. Idempotent for valid
 * code: a header line followed by a deeper-indented block is never touched.
 * Comment lines are skipped. Mirrors `packages/store/scripts/census.py`.
 */
export function repairEmptyBodies(source: string): string {
  const lines = source.split("\n");
  const out = [...lines];
  const indentOf = (line: string): number => line.length - line.trimStart().length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    const stripped = line.trim();
    if (stripped.startsWith("#") || !stripped.endsWith(":")) continue;
    const indent = indentOf(line);
    let nextIndent = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? "";
      if (next.trim() === "") continue;
      nextIndent = indentOf(next);
      break;
    }
    if (nextIndent <= indent) out.splice(i + 1, 0, `${" ".repeat(indent + 4)}pass`);
  }
  return out.join("\n");
}

function siblingSource(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

/** Bake `__CLASS__` (and `__ENTRY__` for pure/in-place) into a runner. */
export function bakeRunner(runnerSource: string, link: PythonLink): string {
  if (!/^[A-Za-z_]\w*$/.test(link.className)) {
    throw new Error(`Invalid Python class name in link: ${link.className}`);
  }
  let baked = runnerSource.replaceAll(CLASS_TOKEN, link.className);
  if (link.actualRule === "method-sequence") {
    if (baked.includes(ENTRY_TOKEN)) {
      throw new Error(`Method-sequence runner must not contain ${ENTRY_TOKEN}`);
    }
    return baked;
  }
  if (!/^[A-Za-z_]\w*$/.test(link.entry)) {
    throw new Error(`Invalid Python entry method in link: ${link.entry}`);
  }
  baked = baked.replaceAll(ENTRY_TOKEN, link.entry);
  if (baked.includes(CLASS_TOKEN) || baked.includes(ENTRY_TOKEN)) {
    throw new Error("Runner template tokens left unbaked");
  }
  return baked;
}

export function assemblePythonRun(options: {
  readonly starterPython: string;
  readonly link: PythonLink;
  readonly runnerSource: string;
  readonly nodesSource?: string;
  readonly samplesSource?: string;
}): AssembledPythonRun {
  const runner = bakeRunner(options.runnerSource, options.link);
  return {
    files: {
      "submission.py": repairEmptyBodies(options.starterPython),
      "runner.py": runner,
      "nodes.py": options.nodesSource ?? siblingSource("nodes.py"),
      "samples.py": options.samplesSource ?? siblingSource("samples.py"),
    },
  };
}
