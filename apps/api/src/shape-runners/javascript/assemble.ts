// @interview-coach/api - JavaScript shape-runner assembly.
//
// Owns: building the per-run files for a linked problem (verbatim starter
// plus export shim, baked shape runner, shared helpers). Surprising: the
// shim mirrors the JS_EXPORT_SHIM precedent (typeof-guarded, never crashes
// on an absent subject).
//
// History: 18a.2; see docs/SESSION_HANDOFF.md.

import { readFileSync } from "node:fs";

export type JSActualRule = "pure" | "in-place" | "method-sequence";

export interface JSLink {
  /** `shape-NNN` for shared shapes, `method-sequence` for design classes. */
  readonly runnerId: string;
  /** Entry free-function name baked into pure/in-place shims; "" for method-sequence. */
  readonly entry: string;
  /** Constructor name for method-sequence; unused for pure/in-place. */
  readonly className: string;
  readonly actualRule: JSActualRule;
}

export interface AssembledJSRun {
  /** `submission.js`, `runner.js`, `nodes.js`, `samples.js` sources. */
  readonly files: Record<string, string>;
}

const SUBJECT_TOKEN = "__SUBJECT__";

/** Appended to the verbatim starter; exposes the entry as `subject`. */
export const JS_EXPORT_SHIM_TEMPLATE = `\n;module.exports = { subject: (typeof ${SUBJECT_TOKEN} !== "undefined" ? ${SUBJECT_TOKEN} : undefined) };\n`;

const JS_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Bake the subject (entry fn or constructor) into the export shim. */
export function bakeJSShim(shimTemplate: string, link: JSLink): string {
  const subject = link.actualRule === "method-sequence" ? link.className : link.entry;
  if (!JS_IDENTIFIER.test(subject)) {
    throw new Error(`Invalid JavaScript subject name in link: ${subject}`);
  }
  const baked = shimTemplate.replaceAll(SUBJECT_TOKEN, subject);
  if (baked.includes(SUBJECT_TOKEN)) {
    throw new Error("Export shim template token left unbaked");
  }
  return baked;
}

function siblingSource(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

export function assembleJSRun(options: {
  readonly starterJs: string;
  readonly link: JSLink;
  readonly runnerSource: string;
  readonly nodesSource?: string;
  readonly samplesSource?: string;
}): AssembledJSRun {
  if (options.runnerSource.includes(SUBJECT_TOKEN)) {
    throw new Error("Runner sources never contain bake tokens");
  }
  return {
    files: {
      "submission.js": options.starterJs + bakeJSShim(JS_EXPORT_SHIM_TEMPLATE, options.link),
      "runner.js": options.runnerSource,
      "nodes.js": options.nodesSource ?? siblingSource("nodes.js"),
      "samples.js": options.samplesSource ?? siblingSource("samples.js"),
    },
  };
}
