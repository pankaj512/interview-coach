// @interview-coach/backend — local code runner (HLD Phase 6, S7a).
//
// Local-dev MVP behind the domain CodeExecutor port. Each execution gets a
// fresh temp dir (submission + harness + cases), a wall-clock timeout (kill
// on expiry), and capped output. Results are deterministic JSON verdicts.
//
// Isolation honesty (audit F6-1): this is NOT a security boundary — no
// namespaces, cgroups, or network egress control. Hardening applied here:
//   - child env scrubbed to an allowlist (no DATABASE_URL/API_AUTH_TOKEN/
//     AZURE_*), HOME/TMPDIR pointed at the scratch dir;
//   - dropped to uid/gid nobody when the backend runs as root;
//   - Node heap cap (--max-old-space-size);
//   - wall-clock timeout + output caps;
//   - refuses to execute in production unless ALLOW_INSECURE_CODE_RUNNER=true.
// Full container isolation (CPU/mem quotas, --network=none) is the deploy-track
// follow-up, mirroring how api-key voice mode is local-dev-only (frozen §7).

import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CodeExecutor,
  CodeSubmission,
  ExecutorOutcome,
  RunLimits,
  RunTestCase,
} from "@interview-coach/domain";

export interface LocalRunnerOptions {
  /** Cap on serialized per-case actuals kept in results. */
  readonly maxActualChars?: number;
  /** Cap on raw child stdout/stderr before it counts as a failure. */
  readonly maxOutputBytes?: number;
  readonly pythonBin?: string;
  /** Environment used for the production gate (defaults to process.env). */
  readonly env?: NodeJS.ProcessEnv;
}

// F6-1: candidate code must not inherit the backend's environment. Only these
// variables reach the child; DATABASE_URL / API_AUTH_TOKEN / AZURE_* never do.
const SANDBOX_ENV_ALLOWLIST: readonly string[] = [
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
];

function sandboxEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SANDBOX_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  // Point HOME/TMPDIR at the per-run scratch dir so nothing reads the real
  // home directory.
  env["HOME"] = dir;
  env["TMPDIR"] = dir;
  return env;
}

// F6-1: Node heap cap as a coarse memory bound (per-run).
const NODE_HEAP_MB = 256;

const DEFAULT_MAX_ACTUAL_CHARS = 20_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;

// Candidate contract, both languages: a callable named `solve`
// (JS: function solve(...) / module.exports = solve /
//  module.exports.solve = solve; Python: def solve(...)).
// Harness calls solve(*args) per case and compares canonically.
const JS_EXPORT_SHIM = `\n;globalThis.__solve =
  typeof solve !== "undefined" && typeof solve === "function" ? solve
  : typeof module !== "undefined" && module.exports !== undefined ?
    (typeof module.exports === "function" ? module.exports
    : module.exports !== null && typeof module.exports === "object" &&
        typeof module.exports.solve === "function" ? module.exports.solve
    : undefined)
  : undefined;\n`;

const JS_HARNESS = `const fs = require("fs");
function canon(value) {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, function (key, val) {
    // F6-5: JSON.stringify(NaN/Infinity) is "null", which would make a
    // non-finite result compare equal to an expected null. Mark them.
    if (typeof val === "number" && !isFinite(val)) return "__nonfinite__:" + String(val);
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const sorted = {};
      for (const k of Object.keys(val).sort()) sorted[k] = val[k];
      return sorted;
    }
    return val;
  });
}
async function main() {
  const cases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  let solve;
  try {
    require("./submission.js");
    solve = globalThis.__solve;
  } catch (error) {
    console.log(JSON.stringify({ loadError: String(error && error.message || error) }));
    process.exit(2);
  }
  if (typeof solve !== "function") {
    console.log(JSON.stringify({ loadError: "solve is not defined or exported as a function" }));
    process.exit(2);
  }
  const results = [];
  for (const c of cases) {
    try {
      const actual = await solve(...c.args);
      let actualJson = null;
      try {
        actualJson = JSON.parse(canon(actual) === "undefined" ? "null" : canon(actual));
      } catch {
        actualJson = null;
      }
      results.push({ name: c.name, passed: canon(actual) === canon(c.expected), actual: actualJson });
    } catch (error) {
      results.push({ name: c.name, passed: false, error: String(error && error.message || error) });
    }
  }
  console.log(JSON.stringify({ results }));
}
main().catch((error) => {
  console.log(JSON.stringify({ loadError: String(error && error.message || error) }));
  process.exit(2);
});
`;

const PY_HARNESS = `import json, sys, math, traceback

def _sanitize(value):
    # F6-5: mark non-finite floats so NaN/Infinity never compare equal to null.
    if isinstance(value, float) and not math.isfinite(value):
        label = "NaN" if math.isnan(value) else ("Infinity" if value > 0 else "-Infinity")
        return "__nonfinite__:" + label
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize(v) for v in value]
    return value

def canon(value):
    return json.dumps(_sanitize(value), sort_keys=True, default=str)

def main():
    with open(sys.argv[1]) as f:
        cases = json.load(f)
    try:
        import submission
        solve = getattr(submission, "solve", submission)
    except Exception as e:
        print(json.dumps({"loadError": str(e)}))
        sys.exit(2)
    if not callable(solve):
        print(json.dumps({"loadError": "solve is not defined or not callable"}))
        sys.exit(2)
    results = []
    for c in cases:
        try:
            actual = solve(*c["args"])
            results.append({"name": c["name"], "passed": canon(actual) == canon(c["expected"]), "actual": json.loads(canon(actual))})
        except Exception as e:
            results.append({"name": c["name"], "passed": False, "error": str(e)})
    print(json.dumps({"results": results}))

try:
    main()
except Exception as e:
    print(json.dumps({"loadError": str(e)}))
    sys.exit(2)
`;

export class LocalCodeRunner implements CodeExecutor {
  private readonly maxActualChars: number;
  private readonly maxOutputBytes: number;
  private readonly pythonBin: string;
  // F6-1: the in-process runner is local-dev only. In production it refuses
  // to execute (runs become `error` runs) unless the operator explicitly opts
  // in — mirroring api-key voice mode (V3-5). Full container isolation with
  // --network=none is the deploy-track follow-up.
  private readonly disabled: boolean;

  constructor(options?: LocalRunnerOptions) {
    this.maxActualChars =
      options?.maxActualChars ?? DEFAULT_MAX_ACTUAL_CHARS;
    this.maxOutputBytes =
      options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.pythonBin = options?.pythonBin ?? "python3";
    const env = options?.env ?? process.env;
    this.disabled =
      env["NODE_ENV"] === "production" &&
      env["ALLOW_INSECURE_CODE_RUNNER"] !== "true";
  }

  async execute(
    submission: CodeSubmission,
    testCases: readonly RunTestCase[],
    limits: RunLimits,
  ): Promise<ExecutorOutcome> {
    if (this.disabled) {
      throw new Error(
        "Code execution is disabled: the local runner is local-dev only. " +
          "Deploy a container-isolated runner, or set " +
          "ALLOW_INSECURE_CODE_RUNNER=true to override explicitly.",
      );
    }
    const startedAt = Date.now();
    const dir = await mkdtemp(join(tmpdir(), "interview-coach-run-"));
    // Let a dropped-privilege child read the scratch dir (F6-1).
    await chmod(dir, 0o777).catch(() => undefined);
    try {
      const payload = testCases.map((t) => ({
        name: t.name,
        args: [...t.args],
        expected: t.expected,
      }));
      if (submission.language === "javascript") {
        await writeFile(join(dir, "submission.js"), submission.code + JS_EXPORT_SHIM, "utf8");
        await writeFile(join(dir, "harness.js"), JS_HARNESS, "utf8");
        await writeFile(join(dir, "cases.json"), JSON.stringify(payload), "utf8");
        return await this.runNode(dir, limits, startedAt, payload.length);
      }
      if (submission.language === "python") {
        await writeFile(join(dir, "submission.py"), submission.code, "utf8");
        await writeFile(join(dir, "harness.py"), PY_HARNESS, "utf8");
        await writeFile(join(dir, "cases.json"), JSON.stringify(payload), "utf8");
        return await this.runPython(dir, limits, startedAt, payload.length);
      }
      throw new Error(`Unsupported language: ${submission.language}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async runNode(
    dir: string,
    limits: RunLimits,
    startedAt: number,
    total: number,
  ): Promise<ExecutorOutcome> {
    return this.execChild(
      process.execPath,
      [`--max-old-space-size=${NODE_HEAP_MB}`, join(dir, "harness.js"), join(dir, "cases.json")],
      dir,
      limits,
      startedAt,
      total,
    );
  }

  private async runPython(
    dir: string,
    limits: RunLimits,
    startedAt: number,
    total: number,
  ): Promise<ExecutorOutcome> {
    return this.execChild(
      this.pythonBin,
      [join(dir, "harness.py"), join(dir, "cases.json")],
      dir,
      limits,
      startedAt,
      total,
    );
  }

  private execChild(
    bin: string,
    args: readonly string[],
    cwd: string,
    limits: RunLimits,
    startedAt: number,
    total: number,
  ): Promise<ExecutorOutcome> {
    const durationMs = () => Date.now() - startedAt;
    return new Promise((resolve) => {
      execFile(
        bin,
        [...args],
        {
          cwd,
          timeout: limits.timeoutMs,
          maxBuffer: this.maxOutputBytes,
          windowsHide: true,
          // F6-1: scrub the environment to an allowlist; when the backend runs
          // as root, drop the child to `nobody` (65534).
          env: sandboxEnv(cwd),
          ...(typeof process.getuid === "function" && process.getuid() === 0
            ? { uid: 65534, gid: 65534 }
            : {}),
        },
        (error, stdout) => {
          if (error !== null) {
            const nodeError = error as NodeJS.ErrnoException & {
              killed?: boolean;
              signal?: string | null;
              code?: string | number | null;
            };
            if (nodeError.killed === true) {
              resolve({
                status: "timeout",
                results: [],
                durationMs: durationMs(),
                error: `Execution exceeded ${limits.timeoutMs}ms and was killed`,
              });
              return;
            }
            const stderr = truncate(
              typeof nodeError.message === "string" ? nodeError.message : "Runner failed",
              2000,
            );
            resolve({
              status: "error",
              results: [],
              durationMs: durationMs(),
              error: stderr,
            });
            return;
          }
          resolve(this.parseHarnessOutput(stdout, durationMs(), total));
        },
      );
    });
  }

  private parseHarnessOutput(
    stdout: string,
    durationMs: number,
    total: number,
  ): ExecutorOutcome {
    let parsed: {
      results?: { name: string; passed: boolean; actual?: unknown; error?: string }[];
      loadError?: string;
    };
    try {
      parsed = JSON.parse(stdout.trim().split("\n").pop() ?? "") as typeof parsed;
    } catch {
      return {
        status: "error",
        results: [],
        durationMs,
        error: truncate(`Harness emitted non-JSON output: ${stdout.slice(0, 500)}`, 2000),
      };
    }
    if (parsed.loadError !== undefined) {
      return {
        status: "error",
        results: [],
        durationMs,
        error: truncate(parsed.loadError, 2000),
      };
    }
    const results = (parsed.results ?? []).slice(0, total).map((r) => ({
      name: String(r.name),
      passed: r.passed === true,
      ...(r.actual === undefined ? {} : { actual: capActual(r.actual, this.maxActualChars) }),
      ...(r.error === undefined ? {} : { error: truncate(String(r.error), 2000) }),
    }));
    return { status: "completed", results, durationMs };
  }
}

function capActual(actual: unknown, max: number): unknown {
  let serialized: string;
  try {
    serialized = JSON.stringify(actual) ?? "null";
  } catch {
    return "(unserializable output)";
  }
  if (serialized.length <= max) return actual;
  return `(output truncated, ${serialized.length} chars)`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
