// @interview-coach/api - C++ shape-runner assembly.
//
// Owns: the per-problem bake of runner templates (token substitution,
// per-case Value literals, scratch-dir files). Surprising: unparseable
// inputs become per-case error rows, never dropped cases.
//
// History: 18a.3; see docs/SESSION_HANDOFF.md.

import {
  CPP_SUBMISSION_FILE,
  VALUE_PRELUDE,
  cppLiteral,
} from "../../cpp-harness.js";
import { parseSampleInput } from "./samples.js";

export interface CppLink {
  readonly runnerId: string;
  readonly entry: string;
  readonly className: string;
  readonly actualRule: "pure" | "in-place" | "method-sequence";
}

export interface CppSample {
  readonly name: string;
  readonly input: string;
}

export interface CppShapeMeta {
  readonly params: readonly string[];
  readonly ret: string;
}

const IDENT_RE = /^[A-Za-z_]\w*$/;
const TOKEN_RE = /__[A-Z]+__/;

function decodeDecl(paramType: string, valueExpr: string, local: string): string {
  switch (paramType) {
    case "int":
    case "long":
      return `int ${local} = static_cast<int>((${valueExpr}).n);`;
    case "string":
      return `std::string ${local} = (${valueExpr}).s;`;
    case "vector<int>":
      return `std::vector<int> ${local} = valueToIntVec(${valueExpr});`;
    case "vector<string>":
      return `std::vector<std::string> ${local} = valueToStrVec(${valueExpr});`;
    case "vector<vector<int>>":
      return `std::vector<std::vector<int>> ${local} = valueToIntVec2D(${valueExpr});`;
    case "ListNode*":
      return `ListNode* ${local} = arrayToList(${valueExpr});`;
    case "TreeNode*":
      return `TreeNode* ${local} = arrayToTree(${valueExpr});`;
    default:
      throw new Error(`unsupported C++ shape param type: ${paramType}`);
  }
}

function encodeExpr(retType: string, expr: string): string {
  switch (retType) {
    case "bool":
      return `Value((${expr}) ? true : false)`;
    case "int":
    case "long":
      return `Value(static_cast<int>(${expr}))`;
    case "double":
      return `Value(static_cast<double>(${expr}))`;
    case "string":
      return `Value(${expr})`;
    case "vector<int>":
      return `intVecToValue(${expr})`;
    case "vector<string>":
      return `strVecToValue(${expr})`;
    case "vector<vector<int>>":
      return `intVec2DToValue(${expr})`;
    case "ListNode*":
      return `listToArray(${expr})`;
    case "TreeNode*":
      return `treeToArray(${expr})`;
    default:
      throw new Error(`unsupported C++ shape return type: ${retType}`);
  }
}

function rowPrinters(name: string): { ok: string; err: string } {
  const qname = `Value::quoted(std::string(${JSON.stringify(name)}))`;
  return {
    ok: `std::cout << "{\\"name\\":" << ${qname} << ",\\"actual\\":" << actual.json() << "}\\n";`,
    err: `catch (const std::exception& e) { std::cout << "{\\"name\\":" << ${qname} << ",\\"error\\":" << Value::quoted(e.what()) << "}\\n"; }\n    catch (...) { std::cout << "{\\"name\\":" << ${qname} << ",\\"error\\":\\"unknown error\\"}\\n"; }`,
  };
}

function errorCase(name: string, message: string): string {
  const qname = `Value::quoted(std::string(${JSON.stringify(name)}))`;
  const qmsg = `Value::quoted(std::string(${JSON.stringify(message)}))`;
  return `  {\n    std::cout << "{\\"name\\":" << ${qname} << ",\\"error\\":" << ${qmsg} << "}\\n";\n  }`;
}

/** Insert `return {};` (or `return;` for void) into empty entry-method bodies. */
export function repairCppStub(
  source: string,
  entries: readonly { readonly name: string; readonly returnsVoid: boolean }[],
): string {
  let out = source;
  for (const { name, returnsVoid } of entries) {
    const re = new RegExp(
      `${name}\\s*\\([^()]*\\)\\s*(?:const\\s*)?\\{([^{}]*)\\}`,
      "g",
    );
    out = out.replace(re, (match, body: string) => {
      const stripped = body.replace(/\/\/[^\n]*/g, "").trim();
      if (stripped !== "") return match;
      return match.slice(0, -1) + `\n        return${returnsVoid ? "" : " {}"};\n    }`;
    });
  }
  return out;
}

/** Substitute __CLASS__/__ENTRY__; rejects blank identifiers. */
export function bakeCppRunner(runnerSource: string, link: CppLink): string {
  if (!IDENT_RE.test(link.className)) {
    throw new Error(`invalid C++ class name: ${link.className}`);
  }
  if (link.actualRule !== "method-sequence" && !IDENT_RE.test(link.entry)) {
    throw new Error(`invalid C++ entry method: ${link.entry}`);
  }
  return runnerSource.split("__CLASS__").join(link.className).split("__ENTRY__").join(link.entry);
}

function pureCase(
  name: string,
  args: readonly unknown[],
  meta: CppShapeMeta,
  className: string,
  entry: string,
): string {
  if (args.length !== meta.params.length) {
    return errorCase(name, `arity mismatch: ${args.length} values for ${meta.params.length} params`);
  }
  const lines: string[] = [];
  const locals: string[] = [];
  meta.params.forEach((t, i) => {
    lines.push(`      Value v${i} = ${cppLiteral(args[i])};`);
    lines.push(`      ${decodeDecl(t, `v${i}`, `a${i}`)}`);
    locals.push(`a${i}`);
  });
  lines.push(`      ${className} obj;`);
  if (meta.ret === "void") {
    lines.push(`      obj.${entry}(${locals.join(", ")});`);
    const snap = locals.map((l, i) => encodeExpr(meta.params[i]!, l)).join(", ");
    lines.push(
      `      Value actual = Value(std::map<std::string, Value>{{"return", Value()}, {"args", Value(std::vector<Value>{${snap}})}});`,
    );
  } else {
    lines.push(`      auto r = obj.${entry}(${locals.join(", ")});`);
    lines.push(`      Value actual = ${encodeExpr(meta.ret, "r")};`);
  }
  const rows = rowPrinters(name);
  lines.push(`      ${rows.ok}`);
  return `  {\n    try {\n${lines.join("\n")}\n    } ${rows.err}\n  }`;
}

function methodSequenceCase(
  name: string,
  ops: readonly string[],
  argsets: readonly unknown[][],
  fragment: string,
): string {
  const lines: string[] = [];
  lines.push(`      const Value opsV = ${cppLiteral(ops)};`);
  lines.push(`      std::vector<std::string> ops;`);
  lines.push(`      for (size_t i = 0; i < opsV.a.size(); i++) ops.push_back(opsV.a[i].s);`);
  lines.push(`      const Value argsetsV = ${cppLiteral(argsets)};`);
  lines.push(`      std::vector<Value> argsets = argsetsV.a;`);
  for (const fl of fragment.split("\n")) lines.push(`      ${fl}`);
  lines.push(`      Value actual(results);`);
  const rows = rowPrinters(name);
  lines.push(`      ${rows.ok}`);
  return `  {\n    try {\n${lines.join("\n")}\n    } ${rows.err}\n  }`;
}

export interface AssembleCppOptions {
  readonly starterCpp: string;
  readonly link: CppLink;
  readonly runnerSource: string;
  readonly nodesSource: string;
  readonly samples: readonly CppSample[];
  /** Parsed from shape_meta.json; required unless method-sequence. */
  readonly shapeMeta?: CppShapeMeta;
  /** Fragment from method_dispatch.json; required for method-sequence. */
  readonly dispatchFragment?: string;
  /** Entry repair list (entry + ms methods); defaults to the link entry. */
  readonly repairEntries?: readonly { readonly name: string; readonly returnsVoid: boolean }[];
}

export function assembleCppRun(options: AssembleCppOptions): {
  readonly files: Record<string, string>;
} {
  const { starterCpp, link, samples } = options;
  const isMs = link.actualRule === "method-sequence";
  if (!isMs && options.shapeMeta === undefined) {
    throw new Error(`missing shape meta for ${link.runnerId}`);
  }
  if (isMs && options.dispatchFragment === undefined) {
    throw new Error(`missing dispatch fragment for ${link.runnerId}`);
  }
  const repairEntries =
    options.repairEntries ??
    (isMs || link.entry === "" ? [] : [{ name: link.entry, returnsVoid: false }]);
  const submission = repairCppStub(starterCpp, repairEntries);
  const baked = bakeCppRunner(options.runnerSource, link);
  const bodies = samples.map((s) => {
    let parsed: ReturnType<typeof parseSampleInput>;
    try {
      parsed = parseSampleInput(s.input);
    } catch (e) {
      return errorCase(s.name, `sample parse error: ${(e as Error).message}`);
    }
    if (isMs) {
      if (parsed.kind !== "ops") return errorCase(s.name, "expected method-call sample");
      return methodSequenceCase(s.name, parsed.ops, parsed.argsets, options.dispatchFragment!);
    }
    if (parsed.kind !== "args") return errorCase(s.name, "expected name=value sample");
    return pureCase(s.name, parsed.args, options.shapeMeta!, link.className, link.entry);
  });
  const main = `${VALUE_PRELUDE}\n#include <bits/stdc++.h>\nusing namespace std;\n\n${baked.replace("__CASES__", bodies.join("\n"))}`;
  if (TOKEN_RE.test(main)) {
    throw new Error(`unbaked token remains for ${link.runnerId}`);
  }
  return {
    files: {
      [CPP_SUBMISSION_FILE]: submission,
      "main.cpp": main,
      "nodes.h": options.nodesSource,
    },
  };
}
