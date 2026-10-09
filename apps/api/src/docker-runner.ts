// @interview-coach/api - Docker-isolated code runner.
//
// Owns: executing untrusted candidate code in throwaway containers
// (--network=none, caps, read-only rootfs, unprivileged user, scrubbed
// env). Surprising: without a daemon, runs fail closed as `error`
// outcomes; images must be pre-pulled or pullable.
//
// History: 16; see docs/SESSION_HANDOFF.md.

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CodeExecutor,
  CodeSubmission,
  ExecutorOutcome,
  RunLimits,
  RunProblemContext,
  RunTestCase,
} from "@interview-coach/core";
import {
  buildCppMain,
  CPP_MAIN_FILE,
  CPP_SUBMISSION_FILE,
} from "./cpp-harness.js";
import { assembleCppRun, type CppShapeMeta } from "./shape-runners/cpp/assemble.js";
import {
  assembleJSRun,
  type JSLink,
} from "./shape-runners/javascript/assemble.js";
import {
  assemblePythonRun,
  type PythonLink,
} from "./shape-runners/python/assemble.js";

export interface DockerRunnerImages {
  readonly javascript: string;
  readonly python: string;
  readonly cpp: string;
}

export interface DockerRunnerOptions {
  readonly images?: Partial<DockerRunnerImages>;
  readonly memory?: string;
  readonly cpus?: string;
  readonly pidsLimit?: number;
  /** Cap on serialized per-case actuals kept in results. */
  readonly maxActualChars?: number;
  /** Cap on raw harness stdout before it counts as a failure. */
  readonly maxOutputBytes?: number;
  readonly dockerBin?: string;
  readonly spawn?: SpawnFn;
}

/** Injectable process boundary (stubbed in unit tests). */
export type SpawnFn = (
  bin: string,
  args: readonly string[],
  opts: { timeoutMs: number },
) => Promise<{ code: number | null; stdout: string; stderr: string; killed: boolean }>;

const DEFAULT_IMAGES: DockerRunnerImages = {
  javascript: "node:24-slim",
  // gcc bookworm ships g++ and python3: one pull covers C++ and Python.
  python: "gcc:14-bookworm",
  cpp: "gcc:14-bookworm",
};

const DEFAULT_MEMORY = "512m";
const DEFAULT_CPUS = "1.0";
const DEFAULT_PIDS_LIMIT = 128;
const DEFAULT_MAX_ACTUAL_CHARS = 20_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
// Bound for non-run Docker calls (inspect/pull/logs/rm) so a wedged
// daemon cannot hang execution forever.
const DOCKER_OP_TIMEOUT_MS = 30_000;

// Candidate contract, both scripting languages: a callable named `solve`
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

// First stdout line when the C++ compile step fails (a program's own
// first line is always a JSON object, so this is unambiguous).
const CPP_BUILD_FAILED_MARKER = "__BUILD_FAILED__";

// Compiler + runner for C++: build to the tmpfs /tmp (the image rootfs is
// read-only), then exec the program. A failed build prints the marker
// first so the runner can tell compile errors from runtime output.
const CPP_SH = `g++ -std=c++17 -O2 -o /tmp/prog /work/main.cpp 2>/tmp/build.err || { echo ${CPP_BUILD_FAILED_MARKER}; cat /tmp/build.err; exit 3; }; exec /tmp/prog`;

function defaultSpawn(
  bin: string,
  args: readonly string[],
  opts: { timeoutMs: number },
): Promise<{ code: number | null; stdout: string; stderr: string; killed: boolean }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      [...args],
      { timeout: opts.timeoutMs, maxBuffer: 4_194_304, windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null) {
          const nodeError = error as NodeJS.ErrnoException & {
            killed?: boolean;
            code?: string | number | null;
          };
          resolve({
            code: typeof nodeError.code === "number" ? nodeError.code : null,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? "") || nodeError.message,
            killed: nodeError.killed === true,
          });
          return;
        }
        resolve({ code: 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), killed: false });
      },
    );
  });
}

function isDaemonDown(stderr: string): boolean {
  // Spawn is only ever used for the Docker CLI: ENOENT means no CLI,
  // connection errors mean no daemon. Both fail closed as error runs.
  return /cannot connect to the docker daemon|ENOENT|no such host|ECONNREFUSED/i.test(stderr);
}

function containerName(): string {
  return `icr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface DockerRunSpec {
  readonly image: string;
  readonly name: string;
  readonly workdir: string;
  readonly command: readonly string[];
  readonly memory: string;
  readonly cpus: string;
  readonly pidsLimit: number;
}

/** Pure arg builder (unit-asserted): the security boundary in one place. */
export function buildRunArgs(spec: DockerRunSpec): string[] {
  return [
    "run",
    "-d",
    "--name",
    spec.name,
    "--network=none",
    `--memory=${spec.memory}`,
    `--cpus=${spec.cpus}`,
    `--pids-limit=${spec.pidsLimit}`,
    "--cap-drop=ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,exec,size=128m",
    "--user",
    "65534:65534",
    "-v",
    `${spec.workdir}:/work:ro`,
    "-w",
    "/work",
    "-e",
    "HOME=/tmp",
    "-e",
    "TMPDIR=/tmp",
    "-e",
    "NODE_OPTIONS=--max-old-space-size=256",
    spec.image,
    ...spec.command,
  ];
}

export class DockerCodeRunner implements CodeExecutor {
  private readonly images: DockerRunnerImages;
  private readonly memory: string;
  private readonly cpus: string;
  private readonly pidsLimit: number;
  private readonly maxActualChars: number;
  private readonly maxOutputBytes: number;
  private readonly dockerBin: string;
  private readonly spawn: SpawnFn;
  private ensuredImages = new Set<string>();

  constructor(options?: DockerRunnerOptions) {
    this.images = { ...DEFAULT_IMAGES, ...options?.images };
    this.memory = options?.memory ?? DEFAULT_MEMORY;
    this.cpus = options?.cpus ?? DEFAULT_CPUS;
    this.pidsLimit = options?.pidsLimit ?? DEFAULT_PIDS_LIMIT;
    this.maxActualChars =
      options?.maxActualChars ?? DEFAULT_MAX_ACTUAL_CHARS;
    this.maxOutputBytes =
      options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.dockerBin = options?.dockerBin ?? "docker";
    this.spawn = options?.spawn ?? defaultSpawn;
  }

  async execute(
    submission: CodeSubmission,
    testCases: readonly RunTestCase[],
    limits: RunLimits,
    context?: RunProblemContext,
  ): Promise<ExecutorOutcome> {
    const startedAt = Date.now();
    const language = submission.language;
    const image =
      language === "javascript"
        ? this.images.javascript
        : language === "python"
          ? this.images.python
          : this.images.cpp;
    // Image pulls happen outside the run timeout budget.
    const ensured = await this.ensureImage(image);
    if (ensured !== null) return this.fail(startedAt, ensured);
    const dir = await mkdtemp(join(tmpdir(), "interview-coach-run-"));
    // The container runs as an unprivileged user: open the scratch dir so
    // the read-only mount is traversable (files are written 0644).
    await chmod(dir, 0o755).catch(() => undefined);
    try {
      const command = await this.writeFiles(language, dir, submission, testCases, context);
      return await this.runContainer(image, dir, command, limits, startedAt, testCases);
    } catch (error) {
      return this.fail(startedAt, error instanceof Error ? error.message : String(error));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private fail(startedAt: number, message: string): ExecutorOutcome {
    return {
      status: "error",
      results: [],
      durationMs: Date.now() - startedAt,
      error: truncate(message, 2000),
    };
  }

  private async ensureImage(image: string): Promise<string | null> {
    if (this.ensuredImages.has(image)) return null;
    const inspect = await this.spawn(this.dockerBin, ["image", "inspect", image], {
      timeoutMs: DOCKER_OP_TIMEOUT_MS,
    });
    if (inspect.code === 0) {
      this.ensuredImages.add(image);
      return null;
    }
    if (isDaemonDown(inspect.stderr)) {
      return `Docker daemon unreachable: ${firstLine(inspect.stderr)}`;
    }
    const pull = await this.spawn(this.dockerBin, ["pull", image], {
      timeoutMs: 300_000,
    });
    if (pull.code !== 0) {
      const reason = isDaemonDown(pull.stderr) ? "Docker daemon unreachable" : "image pull failed";
      return `${reason}: ${firstLine(pull.stderr)} (image ${image})`;
    }
    this.ensuredImages.add(image);
    return null;
  }

  private async writeFiles(
    language: CodeSubmission["language"],
    dir: string,
    submission: CodeSubmission,
    testCases: readonly RunTestCase[],
    context?: RunProblemContext,
  ): Promise<readonly string[]> {
    const payload = testCases.map((t) => ({
      name: t.name,
      args: [...t.args],
      expected: t.expected,
    }));
    if (language === "javascript") {
      if (context?.link !== undefined) {
        return this.writeAssembledJs(dir, submission, testCases, context.link, context);
      }
      await writeFile(join(dir, "submission.js"), submission.code + JS_EXPORT_SHIM, "utf8");
      await writeFile(join(dir, "harness.js"), JS_HARNESS, "utf8");
      await writeFile(join(dir, "cases.json"), JSON.stringify(payload), "utf8");
      return ["node", join("/work", "harness.js"), join("/work", "cases.json")];
    }
    if (language === "python") {
      if (context?.link !== undefined) {
        return this.writeAssembledPython(dir, submission, testCases, context.link, context);
      }
      await writeFile(join(dir, "submission.py"), submission.code, "utf8");
      await writeFile(join(dir, "harness.py"), PY_HARNESS, "utf8");
      await writeFile(join(dir, "cases.json"), JSON.stringify(payload), "utf8");
      return ["python3", join("/work", "harness.py"), join("/work", "cases.json")];
    }
    if (context?.link !== undefined) {
      return this.writeAssembledCpp(dir, submission, testCases, context.link, context);
    }
    await writeFile(join(dir, CPP_SUBMISSION_FILE), submission.code, "utf8");
    await writeFile(
      join(dir, CPP_MAIN_FILE),
      buildCppMain(payload.map((t) => ({ name: t.name, args: t.args }))),
      "utf8",
    );
    return ["sh", "-c", CPP_SH];
  }

  /**
   * Shape-runner C++ assembly for linked problems: bakes the candidate code
   * against the problem's runner link (class entry, not the legacy free
   * `solve`), so verbatim LeetCode-style starters compile. Sources load from
   * the sibling `shape-runners/cpp/` tree (import.meta-relative, prod-safe
   * under tsx). Throws a descriptive error - surfaced as an `error` outcome
   * by execute() - when samples, shape meta, or the dispatch fragment cannot
   * be resolved.
   */
  private async writeAssembledCpp(
    dir: string,
    submission: CodeSubmission,
    testCases: readonly RunTestCase[],
    link: NonNullable<RunProblemContext["link"]>,
    context: RunProblemContext,
  ): Promise<readonly string[]> {
    const cppDir = new URL("./shape-runners/cpp/", import.meta.url);
    const source = (name: string): string =>
      readFileSync(new URL(name, cppDir), "utf8");
    const isMethodSequence = link.actualRule === "method-sequence";
    const samples = this.rawCases(testCases, context);
    let shapeMeta: CppShapeMeta | undefined;
    let dispatchFragment: string | undefined;
    let repairEntries: { readonly name: string; readonly returnsVoid: boolean }[] | undefined;
    if (isMethodSequence) {
      const dispatch = JSON.parse(source("method_dispatch.json")) as Record<
        string,
        { fragment: string; methods: Record<string, { ret: string }> }
      >;
      const problemId = context.problemId;
      const entry = problemId === undefined ? undefined : dispatch[problemId];
      if (entry === undefined) {
        throw new Error(
          `missing dispatch fragment for ${problemId ?? "unknown problem"}`,
        );
      }
      dispatchFragment = entry.fragment;
      repairEntries = Object.entries(entry.methods).map(([name, m]) => ({
        name,
        returnsVoid: m.ret === "void",
      }));
    } else {
      const allMeta = JSON.parse(source("shape_meta.json")) as Record<string, CppShapeMeta>;
      const meta = allMeta[link.runnerId];
      if (meta === undefined) {
        throw new Error(`missing shape meta for ${link.runnerId}`);
      }
      shapeMeta = meta;
      repairEntries =
        link.entry === "" ? [] : [{ name: link.entry, returnsVoid: meta.ret === "void" }];
    }
    const assembled = assembleCppRun({
      starterCpp: submission.code,
      link: {
        runnerId: link.runnerId,
        entry: link.entry,
        className: link.className,
        actualRule: link.actualRule,
      },
      runnerSource: source(isMethodSequence ? "method_sequence.cpp" : "main.cpp"),
      nodesSource: source("nodes.h"),
      samples,
      ...(shapeMeta === undefined ? {} : { shapeMeta }),
      ...(dispatchFragment === undefined ? {} : { dispatchFragment }),
      ...(repairEntries === undefined ? {} : { repairEntries }),
    });
    for (const [name, fileSource] of Object.entries(assembled.files)) {
      await writeFile(join(dir, name), fileSource, "utf8");
    }
    return ["sh", "-c", CPP_SH];
  }

  /**
   * Shape-runner JS assembly for linked problems: exposes the candidate's
   * class entry (not the legacy free `solve`) to the problem's runner.
   * Sources load from the sibling `shape-runners/javascript/` tree
   * (import.meta-relative, prod-safe under tsx). Throws a descriptive error
   * - surfaced as an `error` outcome by execute() - when sample inputs
   * cannot be resolved.
   */
  private async writeAssembledJs(
    dir: string,
    submission: CodeSubmission,
    testCases: readonly RunTestCase[],
    link: NonNullable<RunProblemContext["link"]>,
    context: RunProblemContext,
  ): Promise<readonly string[]> {
    const jsDir = new URL("./shape-runners/javascript/", import.meta.url);
    const runnerFile =
      link.actualRule === "method-sequence" ? "method_sequence.js" : `runners/${link.runnerId}.js`;
    const runnerSource = readFileSync(new URL(runnerFile, jsDir), "utf8");
    const jsLink: JSLink = {
      runnerId: link.runnerId,
      entry: link.entry,
      className: link.className,
      actualRule: link.actualRule,
    };
    const assembled = assembleJSRun({
      starterJs: submission.code,
      link: jsLink,
      runnerSource,
    });
    await writeFile(
      join(dir, "cases.json"),
      JSON.stringify(this.rawCases(testCases, context)),
      "utf8",
    );
    for (const [name, fileSource] of Object.entries(assembled.files)) {
      await writeFile(join(dir, name), fileSource, "utf8");
    }
    return ["node", join("/work", "runner.js")];
  }

  /**
   * Shape-runner Python assembly for linked problems: same contract as the
   * JS branch - the candidate's class entry drives the problem's runner.
   * Throws a descriptive error (surfaced as an `error` outcome) when sample
   * inputs cannot be resolved.
   */
  private async writeAssembledPython(
    dir: string,
    submission: CodeSubmission,
    testCases: readonly RunTestCase[],
    link: NonNullable<RunProblemContext["link"]>,
    context: RunProblemContext,
  ): Promise<readonly string[]> {
    const pythonDir = new URL("./shape-runners/python/", import.meta.url);
    const runnerFile =
      link.actualRule === "method-sequence" ? "method_sequence.py" : `runners/${link.runnerId}.py`;
    const runnerSource = readFileSync(new URL(runnerFile, pythonDir), "utf8");
    const pythonLink: PythonLink = {
      runnerId: link.runnerId,
      entry: link.entry,
      className: link.className,
      actualRule: link.actualRule,
    };
    const assembled = assemblePythonRun({
      starterPython: submission.code,
      link: pythonLink,
      runnerSource,
    });
    await writeFile(
      join(dir, "cases.json"),
      JSON.stringify(this.rawCases(testCases, context)),
      "utf8",
    );
    for (const [name, fileSource] of Object.entries(assembled.files)) {
      await writeFile(join(dir, name), fileSource, "utf8");
    }
    return ["python3", join("/work", "runner.py")];
  }

  /**
   * Raw `{name, input}` cases for the assembled JS/Python runners, pairing
   * each run case with its problem example by index. Throws when an example
   * is missing so the run fails loudly instead of executing the wrong input.
   */
  private rawCases(
    testCases: readonly RunTestCase[],
    context: RunProblemContext,
  ): readonly { name: string; input: string }[] {
    const examples = context.examples ?? [];
    return testCases.map((t, i) => {
      const input = examples[i]?.input;
      if (input === undefined) {
        throw new Error(`missing sample input for case ${t.name}`);
      }
      return { name: t.name, input };
    });
  }

  private async runContainer(
    image: string,
    dir: string,
    command: readonly string[],
    limits: RunLimits,
    startedAt: number,
    testCases: readonly RunTestCase[],
  ): Promise<ExecutorOutcome> {
    const durationMs = () => Date.now() - startedAt;
    const name = containerName();
    const created = await this.spawn(
      this.dockerBin,
      buildRunArgs({
        image,
        name,
        workdir: dir,
        command,
        memory: this.memory,
        cpus: this.cpus,
        pidsLimit: this.pidsLimit,
      }),
      { timeoutMs: DOCKER_OP_TIMEOUT_MS },
    );
    if (created.code !== 0) {
      if (isDaemonDown(created.stderr)) {
        return this.fail(startedAt, `Docker daemon unreachable: ${firstLine(created.stderr)}`);
      }
      return this.fail(startedAt, `Container start failed: ${firstLine(created.stderr)}`);
    }
    const containerId = created.stdout.trim().split("\n").pop() ?? name;
    const waited = await this.spawn(this.dockerBin, ["wait", containerId], {
      timeoutMs: limits.timeoutMs,
    });
    if (waited.killed) {
      // Wall-clock expiry: kill the container (killing the CLI alone
      // would leave it running), remove it, report a timeout run.
      await this.spawn(this.dockerBin, ["kill", containerId], {
        timeoutMs: DOCKER_OP_TIMEOUT_MS,
      });
      await this.spawn(this.dockerBin, ["rm", "-f", containerId], {
        timeoutMs: DOCKER_OP_TIMEOUT_MS,
      });
      return {
        status: "timeout",
        results: [],
        durationMs: durationMs(),
        error: `Execution exceeded ${limits.timeoutMs}ms and was killed`,
      };
    }
    if (waited.code !== 0) {
      await this.spawn(this.dockerBin, ["rm", "-f", containerId], {
        timeoutMs: DOCKER_OP_TIMEOUT_MS,
      });
      return this.fail(startedAt, `Container wait failed: ${firstLine(waited.stderr)}`);
    }
    // NOTE: this is the container's exit code (printed by `docker wait`),
    // not the CLI's - the CLI exits 0 even when the container failed.
    const containerCode = Number.parseInt(waited.stdout.trim().split("\n").pop() ?? "", 10);
    const logged = await this.spawn(this.dockerBin, ["logs", containerId], {
      timeoutMs: DOCKER_OP_TIMEOUT_MS,
    });
    await this.spawn(this.dockerBin, ["rm", "-f", containerId], {
      timeoutMs: DOCKER_OP_TIMEOUT_MS,
    });
    if (!Number.isInteger(containerCode)) {
      return {
        status: "error",
        results: [],
        durationMs: durationMs(),
        error: truncate(`Container wait returned non-numeric output: ${firstLine(waited.stdout)}`, 2000),
      };
    }
    if (containerCode !== 0 && logged.stdout.trim() === "") {
      return {
        status: "error",
        results: [],
        durationMs: durationMs(),
        error: truncate(
          `Container exited ${containerCode} with no output: ${firstLine(logged.stderr)}`,
          2000,
        ),
      };
    }
    return this.parseHarnessOutput(logged.stdout, testCases, durationMs());
  }

  private parseHarnessOutput(
    stdout: string,
    testCases: readonly RunTestCase[],
    durationMs: number,
  ): ExecutorOutcome {
    if (stdout.length > this.maxOutputBytes) {
      return {
        status: "error",
        results: [],
        durationMs,
        error: `Harness output exceeded ${this.maxOutputBytes} bytes and was discarded`,
      };
    }
    const text = stdout;
    const total = testCases.length;
    // Single-JSON protocol (JS/Python harnesses): the last line is the verdict.
    const single = this.parseSingleJsonProtocol(text);
    if (single !== null) {
      return this.toOutcome(single, durationMs, total);
    }
    // JSON-lines protocol (C++ harness): one verdict object per line.
    // The harness prints actuals only; pass/fail is decided here against
    // the expected values with the same canonical compare the JS/Python
    // harnesses use in-language.
    const expectedByName = new Map(testCases.map((t) => [t.name, t.expected] as const));
    const { raws, loadError } = this.parseJsonLinesProtocol(text);
    if (raws.length === 0 && loadError === undefined && text.trim() !== "") {
      return {
        status: "error",
        results: [],
        durationMs,
        error: truncate(`Harness emitted non-JSON output: ${text.slice(0, 500)}`, 2000),
      };
    }
    if (loadError !== undefined) {
      const detail = text
        .split("\n")
        .slice(1)
        .join("\n")
        .trim();
      return {
        status: "error",
        results: [],
        durationMs,
        error: truncate(detail === "" ? loadError : `${loadError}: ${detail}`, 2000),
      };
    }
    return this.toOutcome(
      {
        results: raws.slice(0, total).map((r) => ({
          name: r.name,
          passed:
            r.error === undefined &&
            expectedByName.has(r.name) &&
            canonJson(r.actual) === canonJson(expectedByName.get(r.name)),
          ...(r.actual === undefined ? {} : { actual: r.actual }),
          ...(r.error === undefined ? {} : { error: r.error }),
        })),
      },
      durationMs,
      total,
    );
  }

  private parseSingleJsonProtocol(text: string): {
    results?: { name: string; passed: boolean; actual?: unknown; error?: string }[];
    loadError?: string;
  } | null {
    try {
      const parsed = JSON.parse(text.trim().split("\n").pop() ?? "") as {
        results?: { name: string; passed: boolean; actual?: unknown; error?: string }[];
        loadError?: string;
      };
      if (parsed !== null && typeof parsed === "object" && ("results" in parsed || "loadError" in parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to the JSON-lines protocol.
    }
    return null;
  }

  private parseJsonLinesProtocol(text: string): {
    raws: { name: string; actual?: unknown; error?: string }[];
    loadError: string | undefined;
  } {
    const raws: { name: string; actual?: unknown; error?: string }[] = [];
    let loadError: string | undefined;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      if (trimmed === CPP_BUILD_FAILED_MARKER) {
        loadError = "C++ compile error";
        continue;
      }
      if (loadError === "C++ compile error") continue;
      try {
        const row = JSON.parse(trimmed) as { name?: unknown; actual?: unknown; error?: unknown };
        if (row !== null && typeof row === "object" && typeof row["name"] === "string") {
          raws.push({
            name: row["name"],
            ...(row["actual"] === undefined ? {} : { actual: row["actual"] }),
            ...(row["error"] === undefined ? {} : { error: String(row["error"]) }),
          });
        }
      } catch {
        // Candidate debug prints are not verdicts; skip them so extra
        // stdout no longer fails the run. A line shaped exactly like a
        // verdict row still collides and is read as one.
        continue;
      }
    }
    return { raws, loadError };
  }

  private toOutcome(
    parsed: {
      results?: { name: string; passed: boolean; actual?: unknown; error?: string }[];
      loadError?: string;
    },
    durationMs: number,
    total: number,
  ): ExecutorOutcome {
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

// Canonical compare for harness-printed actuals (mirrors the in-harness
// canon() the JS/Python harnesses use): sorted keys, non-finite numbers
// marked so they never equal null.
function canonJson(value: unknown): string {
  if (value === undefined) return "undefined";
  return (
    JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === "number" && !Number.isFinite(val)) {
        return `__nonfinite__:${String(val)}`;
      }
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(val).sort()) {
          sorted[k] = (val as Record<string, unknown>)[k];
        }
        return sorted;
      }
      return val;
    }) ?? "null"
  );
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
  return text.length <= max ? text : text.slice(0, max) + "...";
}

function firstLine(text: string): string {
  return text.split("\n")[0]?.trim() || "unknown error";
}
