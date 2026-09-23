// TS-side sample-input parsing for the C++ shape runners (feature 18a.3).
//
// Cache examples carry LeetCode `name = value, ...` text shared across
// languages (Python-literal syntax: single quotes, True/False/None), or the
// method-call form (a JSON op-name array followed by a JSON arg-array array).
// Parsing happens TS-side; cases cross into C++ as embedded Value literals
// via cppLiteral, so no C++ parsing exists. Unparseable inputs throw — the
// assembler embeds them as per-case error rows, never drops them.

export type ParsedSample =
  | { readonly kind: "args"; readonly args: readonly unknown[] }
  | { readonly kind: "ops"; readonly ops: readonly string[]; readonly argsets: readonly unknown[][] };

function splitFirstJson(text: string): [unknown, string] {
  let depth = 0;
  let inStr = false;
  let esc = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (!started) {
      if (ch === "[" || ch === "{") {
        started = true;
        depth = 1;
      } else if (ch.trim() !== "") {
        throw new Error("method-call input does not start with a JSON array");
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        return [JSON.parse(text.slice(0, i + 1)), text.slice(i + 1)];
      }
    }
  }
  throw new Error("unbalanced JSON in method-call input");
}

/** Split on top-level commas, aware of brackets and both quote styles. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let quote: string | null = null;
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
    if (ch === "[" || ch === "{" || ch === "(") depth++;
    if (ch === "]" || ch === "}" || ch === ")") {
      depth--;
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

/** Convert one Python-literal scalar/value to a JSON value. */
function pyLiteralToJson(text: string): unknown {
  const t = text.trim();
  // Fast path: already JSON.
  try {
    return JSON.parse(t);
  } catch {
    // Fall through to Python-literal conversion.
  }
  let out = "";
  let i = 0;
  const n = t.length;
  const convertWord = (word: string): string | null => {
    if (word === "True") return "true";
    if (word === "False") return "false";
    if (word === "None") return "null";
    return null;
  };
  while (i < n) {
    const ch = t[i]!;
    if (ch === "'") {
      // Single-quoted string: unescape minimally, re-emit as JSON.
      let raw = "";
      i++;
      let closed = false;
      while (i < n) {
        const c = t[i]!;
        if (c === "\\" && i + 1 < n) {
          const nx = t[i + 1]!;
          if (nx === "'") raw += "'";
          else if (nx === "\\") raw += "\\";
          else if (nx === "n") raw += "\n";
          else if (nx === "t") raw += "\t";
          else if (nx === "r") raw += "\r";
          else raw += nx;
          i += 2;
          continue;
        }
        if (c === "'") {
          closed = true;
          i++;
          break;
        }
        raw += c;
        i++;
      }
      if (!closed) throw new Error("unterminated single-quoted string in sample input");
      out += JSON.stringify(raw);
      continue;
    }
    if (ch === '"') {
      // Double-quoted string: copy verbatim (escape-aware).
      out += ch;
      i++;
      while (i < n) {
        const c = t[i]!;
        out += c;
        i++;
        if (c === "\\" && i < n) {
          out += t[i]!;
          i++;
          continue;
        }
        if (c === '"') break;
      }
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[\w]/.test(t[j]!)) j++;
      const word = t.slice(i, j);
      const conv = convertWord(word);
      if (conv === null) throw new Error(`non-literal sample value near "${word}"`);
      out += conv;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return JSON.parse(out);
}

const NAME_VALUE_RE = /^\s*[A-Za-z_]\w*\s*=\s*[\s\S]+$/;

/** Parse one cache sample input into JSON args or method-call ops/argsets. */
export function parseSampleInput(input: string): ParsedSample {
  const trimmed = input.trim();
  if (trimmed.startsWith("[")) {
    const [ops, rest] = splitFirstJson(trimmed);
    const [argsets] = splitFirstJson(rest.trim() === "" ? "[]" : rest);
    if (!Array.isArray(ops) || !ops.every((o) => typeof o === "string")) {
      throw new Error("method-call ops are not a string array");
    }
    if (!Array.isArray(argsets) || !argsets.every((a) => Array.isArray(a))) {
      throw new Error("method-call argsets are not an array array");
    }
    if (ops.length !== argsets.length || ops.length === 0) {
      throw new Error("op/argset length mismatch");
    }
    return { kind: "ops", ops, argsets: argsets as unknown[][] };
  }
  const args: unknown[] = [];
  for (const part of splitTopLevel(trimmed)) {
    if (!NAME_VALUE_RE.test(part)) {
      throw new Error(`sample input is not name=value pairs: ${part.slice(0, 40)}`);
    }
    const valueText = part.slice(part.indexOf("=") + 1);
    args.push(pyLiteralToJson(valueText));
  }
  if (args.length === 0) throw new Error("sample input has no values");
  return { kind: "args", args };
}
