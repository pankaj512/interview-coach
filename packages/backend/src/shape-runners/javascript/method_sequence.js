// Method-sequence runner (feature 18a.2): covers every `method-sequence` JS
// census link (constructor + prototype-method design classes).
//
// Case inputs are the LeetCode method-call form: a JSON op-name array followed
// by a JSON arg-array array (any whitespace between them). The first op
// constructs the baked subject (`new subject(...argsets[0])`); each later op
// calls that method on the instance. Actual = per-op result list (null for
// void/undefined ops). The submission exports `subject` (the constructor) via
// the appended export shim. Never crashes the harness: every failure is a
// per-case `{"name","error"}` line.

const submission = require("./submission");
const fs = require("fs");

function splitFirstJson(text) {
  let i = 0;
  while (i < text.length && /\s/.test(text[i])) i++;
  const start = i;
  const ch = text[i];
  if (ch !== "[" && ch !== "{") {
    throw new Error("method-sequence input does not start with a JSON array/object");
  }
  let depth = 0;
  let quote = null;
  let esc = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quote !== null) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return [text.slice(start, i), text.slice(i)];
}

function main() {
  const cases = JSON.parse(fs.readFileSync("cases.json", "utf8"));
  for (const kase of cases) {
    const name = kase.name;
    try {
      const [first, rest] = splitFirstJson(kase.input);
      const ops = JSON.parse(first);
      const argsets = JSON.parse(rest);
      if (!Array.isArray(ops) || !Array.isArray(argsets)) {
        throw new Error("method-sequence input is not [ops, argsets]");
      }
      if (ops.length === 0 || ops.length !== argsets.length) {
        throw new Error("op/argset length mismatch");
      }
      const obj = new submission.subject(...argsets[0]);
      const results = [null];
      for (let k = 1; k < ops.length; k++) {
        results.push(obj[ops[k]](...argsets[k]));
      }
      console.log(
        JSON.stringify({ name, actual: results }, (kk, v) => (v === undefined ? null : v)),
      );
    } catch (e) {
      const label = e instanceof Error ? `${e.name}: ${e.message}` : `Thrown: ${String(e)}`;
      console.log(JSON.stringify({ name, error: label }));
    }
  }
}

main();
