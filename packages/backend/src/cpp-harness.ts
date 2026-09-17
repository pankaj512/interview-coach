// @interview-coach/backend — C++ candidate harness (feature 16).
//
// Candidate contract (mirrors the JS/Python "callable named solve" rule):
// the submission defines `solve` taking/returning `Value`, e.g.
//   Value solve(Value a, Value b) { ... }
// `Value` is declared in the generated prelude below, so the submission
// sees it. Do not define `main` (a duplicate definition is a compile
// error, surfaced as an `error` run).
//
// Cases cross the boundary as generated C++ literals (cppLiteral), not
// JSON: the program prints one JSON object per stdout line
// ({"name","actual"} or {"name","error"}), which the Docker runner parses
// TS-side and compares with the existing canonical-compare path. NaN and
// infinities embed as "__nonfinite__:<label>" markers so they never
// compare equal to null (same F6-5 rule as the JS/Python harnesses).

/** Serialize a JSON value to a C++ `Value(...)` expression. */
export function cppLiteral(value: unknown): string {
  if (value === null) return "Value()";
  if (typeof value === "boolean") return value ? "Value(true)" : "Value(false)";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return 'Value::nonFinite("NaN")';
    if (value === Number.POSITIVE_INFINITY) return 'Value::nonFinite("Infinity")';
    if (value === Number.NEGATIVE_INFINITY) return 'Value::nonFinite("-Infinity")';
    if (Number.isInteger(value) && Math.abs(value) < 2 ** 53) return `Value(${value})`;
    // JSON shortest-round-trip doubles are valid C++ double literals.
    return `Value(${JSON.stringify(value)})`;
  }
  if (typeof value === "string") return `Value("${cEscape(value)}")`;
  if (Array.isArray(value)) {
    return `Value(std::vector<Value>{${value.map(cppLiteral).join(", ")}})`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `{"${cEscape(k)}", ${cppLiteral(v)}}`);
    return `Value(std::map<std::string, Value>{${entries.join(", ")}})`;
  }
  throw new Error(`Cannot embed ${typeof value} in a C++ harness`);
}

/** Escape a string for a C++ double-quoted literal. */
export function cEscape(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (code < 0x20 || code === 0x7f) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else out += ch;
  }
  return out;
}

// Fixed prelude: the Value variant, JSON printing, and string quoting.
// The submission is compiled after this prelude, then the generated main.
const VALUE_PRELUDE = `#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

struct Value {
  enum class T { Null, Bool, Num, Str, Arr, Obj } t = T::Null;
  bool b = false;
  double n = 0;
  bool isInt = false;
  std::string s;
  std::vector<Value> a;
  std::map<std::string, Value> o;
  std::string marker;
  Value() {}
  Value(bool v) : t(T::Bool), b(v) {}
  Value(int v) : t(T::Num), n(v), isInt(true) {}
  Value(long long v) : t(T::Num), n(static_cast<double>(v)), isInt(true) {}
  Value(double v) : t(T::Num), n(v), isInt(false) {}
  Value(const char* v) : t(T::Str), s(v) {}
  Value(const std::string& v) : t(T::Str), s(v) {}
  Value(const std::vector<Value>& v) : t(T::Arr), a(v) {}
  Value(const std::map<std::string, Value>& v) : t(T::Obj), o(v) {}
  static Value nonFinite(const std::string& label) {
    Value v;
    v.marker = "__nonfinite__:" + label;
    return v;
  }
  static std::string quoted(const std::string& v) {
    std::string out = "\\"";
    for (char c : v) {
      if (c == '\\\\') out += "\\\\\\\\";
      else if (c == '"') out += "\\\\\\"";
      else if (c == '\\n') out += "\\\\n";
      else if (c == '\\r') out += "\\\\r";
      else if (c == '\\t') out += "\\\\t";
      else out += c;
    }
    return out + "\\"";
  }
  std::string json() const {
    if (!marker.empty()) return quoted(marker);
    switch (t) {
      case T::Null: return "null";
      case T::Bool: return b ? "true" : "false";
      case T::Num: {
        if (!std::isfinite(n)) {
          if (n != n) return quoted("__nonfinite__:NaN");
          return quoted(std::string("__nonfinite__:") + (n > 0 ? "Infinity" : "-Infinity"));
        }
        if (isInt) return std::to_string(static_cast<long long>(n));
        { std::ostringstream o; o << std::setprecision(17) << n; return o.str(); }
      }
      case T::Str: return quoted(s);
      case T::Arr: {
        std::string out = "[";
        for (size_t i = 0; i < a.size(); i++) {
          if (i > 0) out += ",";
          out += a[i].json();
        }
        return out + "]";
      }
      case T::Obj: {
        std::string out = "{";
        bool first = true;
        for (const auto& kv : o) {
          if (!first) out += ",";
          first = false;
          out += quoted(kv.first) + ":" + kv.second.json();
        }
        return out + "}";
      }
    }
    return "null";
  }
};
`;

export interface CppCase {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** Generate main.cpp: includes the submission, calls solve per case. */
export function buildCppMain(cases: readonly CppCase[]): string {
  const bodies = cases.map((c) => {
    // Case names are validated (1..120 chars); JSON.stringify output is
    // always a valid C++ string literal (no \/ escapes, \uXXXX allowed).
    const qname = JSON.stringify(c.name);
    const call = `solve(${c.args.map(cppLiteral).join(", ")})`;
    return `  try { Value r = ${call}; std::cout << "{\\"name\\":" << Value::quoted(std::string(${qname})) << ",\\"actual\\":" << r.json() << "}\\n"; }
  catch (const std::exception& e) { std::cout << "{\\"name\\":" << Value::quoted(std::string(${qname})) << ",\\"error\\":" << Value::quoted(e.what()) << "}\\n"; }
  catch (...) { std::cout << "{\\"name\\":" << Value::quoted(std::string(${qname})) << ",\\"error\\":\\"unknown error\\"}\\n"; }`;
  });
  return `${VALUE_PRELUDE}
#include "submission.cpp"

int main() {
${bodies.join("\n")}
  return 0;
}
`;
}

/** Filenames written to the per-run scratch dir for C++. */
export const CPP_SUBMISSION_FILE = "submission.cpp";
export const CPP_MAIN_FILE = "main.cpp";
