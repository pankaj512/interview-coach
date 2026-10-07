// Shared sample-input parsing for the JavaScript shape runners (feature 18a.2).
//
// Sample inputs are LeetCode `name = value, ...` strings whose values are
// JSON-compatible. Commas are split at bracket depth 0 (quote-aware) and each
// value goes through JSON.parse; non-literal samples (e.g. `_` placeholders,
// single-quoted strings) throw so the runner reports a per-case error, never
// a harness crash.

function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  let quote = null;
  let esc = false;
  for (const ch of s) {
    if (quote !== null) {
      cur += ch;
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "[" || ch === "{" || ch === "(") depth += 1;
    if (ch === "]" || ch === "}" || ch === ")") {
      depth -= 1;
      if (depth < 0) throw new Error("unbalanced brackets in sample input");
    }
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseArgs(input) {
  return splitTopLevel(input).map((part) => {
    const m = /^([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*)$/.exec(part.trim());
    if (!m) throw new Error(`sample input is not name=value pairs: ${part.trim()}`);
    try {
      return JSON.parse(m[2]);
    } catch {
      throw new Error(`non-literal sample value for ${m[1]}`);
    }
  });
}

module.exports = { parseArgs };
