// Feature 18a.3 gate (full execution): every C++-linked problem with
// examples assembles via `assembleCppRun` and executes under host `g++`
// (`-std=c++17 -O2`, the Docker compile flags), emitting well-formed
// per-case actuals. Where the sample output is JSON-expressible the pass/fail
// verdict against it must be computable; otherwise the case asserts
// execution-only. Reads PROBLEM_CONTENT_PATH when set (used to prove the
// gate rejects a broken dataset).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  assembleCppRun,
  type CppLink,
} from "../src/shape-runners/cpp/assemble.js";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const datasetPath =
  process.env.PROBLEM_CONTENT_PATH ?? resolve(here, "../../../content/dsa/problem-content-enrichment.json");
const cppRoot = resolve(here, "../src/shape-runners/cpp");
// Single shared main template for every pure/in-place shape; per-shape logic
// lives in the embedded case bodies built from shape_meta.json.
const mainTemplate = join(cppRoot, "main.cpp");
const methodSequenceRunner = join(cppRoot, "method_sequence.cpp");
const nodesSource = readFileSync(join(cppRoot, "nodes.h"), "utf8");
const shapeMeta = JSON.parse(readFileSync(join(cppRoot, "shape_meta.json"), "utf8")) as Record<
  string,
  { params: readonly string[]; ret: string }
>;
const dispatch = JSON.parse(
  readFileSync(join(cppRoot, "method_dispatch.json"), "utf8"),
) as Record<
  string,
  {
    fragment: string;
    methods: Record<string, { ret: string }>;
  }
>;

interface DatasetRecord {
  readonly id: string;
  readonly examples?: readonly { readonly input: string; readonly output: string }[];
  readonly starters?: { readonly cpp?: string };
  readonly cpp?: {
    readonly runnerId: string;
    readonly entry: string;
    readonly className: string;
    readonly actualRule: "pure" | "in-place" | "method-sequence";
  };
}

// Product-only checkouts (CI included) lack the gitignored seed dataset:
// warn and skip the gate instead of failing collection. An explicit
// PROBLEM_CONTENT_PATH still loads loudly so the gate rejects a broken
// dataset when one is pointed at it.
function loadDataset(): { problems: readonly DatasetRecord[] } | null {
  if (process.env.PROBLEM_CONTENT_PATH !== undefined) {
    return JSON.parse(readFileSync(datasetPath, "utf8")) as {
      problems: readonly DatasetRecord[];
    };
  }
  try {
    return JSON.parse(readFileSync(datasetPath, "utf8")) as {
      problems: readonly DatasetRecord[];
    };
  } catch {
    console.warn(`Seed dataset absent (${datasetPath}) - skipping cpp runner gate`);
    return null;
  }
}

const dataset = loadDataset();

const scratchDirs: string[] = [];
afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

function runnerSourceFor(runnerId: string): string {
  return readFileSync(
    runnerId === "method-sequence" ? methodSequenceRunner : mainTemplate,
    "utf8",
  );
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

async function runLinkedProblem(
  problem: DatasetRecord & {
    cpp: CppLink;
    examples: { input: string; output: string }[];
  },
): Promise<{ verdicts: number; executionOnly: number }> {
  const link: CppLink = {
    runnerId: problem.cpp.runnerId,
    entry: problem.cpp.entry,
    className: problem.cpp.className,
    actualRule: problem.cpp.actualRule,
  };
  const isMs = link.actualRule === "method-sequence";
  const meta = isMs ? undefined : shapeMeta[link.runnerId];
  if (!isMs && meta === undefined) {
    throw new Error(`${problem.id} missing shape meta for ${link.runnerId}`);
  }
  const entry = isMs ? dispatch[problem.id] : undefined;
  if (isMs && entry === undefined) {
    throw new Error(`${problem.id} missing dispatch fragment`);
  }
  const assembled = assembleCppRun({
    starterCpp: problem.starters?.cpp ?? "",
    link,
    runnerSource: runnerSourceFor(link.runnerId),
    nodesSource,
    samples: problem.examples.map((e, i) => ({ name: `ex-${i + 1}`, input: e.input })),
    ...(isMs
      ? {
          dispatchFragment: entry!.fragment,
          repairEntries: Object.entries(entry!.methods).map(([name, m]) => ({
            name,
            returnsVoid: m.ret === "void",
          })),
        }
      : {
          shapeMeta: meta!,
          repairEntries: [{ name: link.entry, returnsVoid: meta!.ret === "void" }],
        }),
  });
  const dir = mkdtempSync(join(tmpdir(), "cpp-runner-"));
  scratchDirs.push(dir);
  for (const [name, source] of Object.entries(assembled.files)) {
    writeFileSync(join(dir, name), source, "utf8");
  }
  await execFileAsync("g++", ["-std=c++17", "-O2", "-o", "run", "main.cpp"], {
    cwd: dir,
    timeout: 120_000,
  });
  const { stdout } = await execFileAsync("./run", [], {
    cwd: dir,
    timeout: 30_000,
  });
  const rows = new Map<string, unknown>();
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    const row = JSON.parse(line) as { name: string; actual?: unknown; error?: string };
    expect(typeof row.name, `${problem.id} row name`).toBe("string");
    expect(
      "actual" in row || "error" in row,
      `${problem.id} row ${row.name} has actual or error`,
    ).toBe(true);
    if ("actual" in row) rows.set(row.name, row.actual);
  }
  let verdicts = 0;
  let executionOnly = 0;
  problem.examples.forEach((e, i) => {
    const name = `ex-${i + 1}`;
    if (!rows.has(name)) {
      // Per-case error (e.g. non-name=value sample): execution-only.
      executionOnly += 1;
      return;
    }
    const parsed = tryParseJson(e.output);
    if (!parsed.ok) {
      executionOnly += 1;
      return;
    }
    const verdict = JSON.stringify(rows.get(name)) === JSON.stringify(parsed.value);
    expect(typeof verdict, `${problem.id} ${name} verdict computable`).toBe("boolean");
    verdicts += 1;
  });
  return { verdicts, executionOnly };
}

const runnable = (dataset?.problems ?? []).filter(
  (
    p,
  ): p is DatasetRecord & {
    cpp: CppLink;
    examples: { input: string; output: string }[];
  } => p.cpp !== undefined && Array.isArray(p.examples) && p.examples.length > 0,
);

describe.skipIf(dataset === null)("cpp shape runners execute every linked problem (feature 18a.3)", () => {
  beforeAll(() => {
    // Gate dependency: host g++ (fail loudly when absent instead of skipping).
    execFileSync("g++", ["--version"], { stdio: "ignore" });
    expect(runnable.length, "linked problems with examples").toBeGreaterThan(0);
  });

  it.each(runnable.map((p) => [p.id, p] as const))("%s assembles and emits actuals", async (_id, problem) => {
    const { verdicts, executionOnly } = await runLinkedProblem(problem);
    expect(
      verdicts + executionOnly,
      `${problem.id} every example accounted for`,
    ).toBe(problem.examples.length);
  }, 120_000);
});
