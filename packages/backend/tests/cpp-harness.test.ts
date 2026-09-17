// Feature 16: C++ literal serializer + main.cpp generator (no Docker needed).

import { describe, expect, it } from "vitest";
import {
  buildCppMain,
  cEscape,
  cppLiteral,
  CPP_MAIN_FILE,
  CPP_SUBMISSION_FILE,
} from "../src/cpp-harness.js";

describe("cppLiteral", () => {
  it("covers scalars", () => {
    expect(cppLiteral(null)).toBe("Value()");
    expect(cppLiteral(true)).toBe("Value(true)");
    expect(cppLiteral(false)).toBe("Value(false)");
    expect(cppLiteral(2)).toBe("Value(2)");
    expect(cppLiteral(-7)).toBe("Value(-7)");
    expect(cppLiteral(2.5)).toBe("Value(2.5)");
    expect(cppLiteral("hi")).toBe('Value("hi")');
  });

  it("marks non-finite numbers so they never equal null", () => {
    expect(cppLiteral(Number.NaN)).toBe('Value::nonFinite("NaN")');
    expect(cppLiteral(Number.POSITIVE_INFINITY)).toBe('Value::nonFinite("Infinity")');
    expect(cppLiteral(Number.NEGATIVE_INFINITY)).toBe('Value::nonFinite("-Infinity")');
  });

  it("escapes strings for C++ literals", () => {
    expect(cEscape('a"b\\c')).toBe('a\\"b\\\\c');
    expect(cEscape("l1\nl2\ttab")).toBe("l1\\nl2\\ttab");
    expect(cEscape("a\bb\fc")).toBe("a\\bb\\fc");
    expect(cEscape("bell")).toBe("bell\\u0007");
    expect(cppLiteral('say "hi"\nbye')).toBe('Value("say \\"hi\\"\\nbye")');
  });

  it("nests arrays and sorts object keys deterministically", () => {
    expect(cppLiteral([1, "a", null])).toBe(
      'Value(std::vector<Value>{Value(1), Value("a"), Value()})',
    );
    expect(cppLiteral({ b: 1, a: [true] })).toBe(
      'Value(std::map<std::string, Value>{{"a", Value(std::vector<Value>{Value(true)})}, {"b", Value(1)}})',
    );
  });

  it("rejects non-JSON values", () => {
    expect(() => cppLiteral(undefined)).toThrow("Cannot embed");
    expect(() => cppLiteral(() => 1)).toThrow("Cannot embed");
  });
});

describe("buildCppMain", () => {
  const main = buildCppMain([
    { name: "adds", args: [2, 3] },
    { name: 'quote"name', args: ["x"] },
  ]);

  it("includes the submission and a main with per-case calls", () => {
    expect(main).toContain('#include "submission.cpp"');
    expect(main).toContain("int main()");
    expect(main).toContain("solve(Value(2), Value(3))");
    expect(main).toContain('solve(Value("x"))');
    expect(main).toContain("struct Value");
  });

  it("quotes tricky case names as valid C++ literals", () => {
    // JSON.stringify output is always a valid C++ string literal.
    expect(main).toContain('"quote\\"name"');
  });

  it("declares the filenames used by the runner", () => {
    expect(CPP_SUBMISSION_FILE).toBe("submission.cpp");
    expect(CPP_MAIN_FILE).toBe("main.cpp");
  });
});
