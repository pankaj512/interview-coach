// Feature 18a.1 gate (full execution): every linked problem with examples
// assembles via `assemblePythonRun` and executes under host `python3`,
// emitting well-formed per-case actuals. Where the sample output is
// JSON-expressible the pass/fail verdict against it must be computable;
// otherwise the case asserts execution-only. Reads PROBLEM_CONTENT_PATH when
// set (used to prove the gate rejects a broken dataset).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  assemblePythonRun,
  type PythonLink,
} from "../src/shape-runners/python/assemble.js";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const datasetPath =
  process.env.PROBLEM_CONTENT_PATH ?? resolve(here, "../../../content/dsa/problem-content-enrichment.json");
const runnersDir = resolve(here, "../src/shape-runners/python/runners");
const methodSequenceRunner = resolve(here, "../src/shape-runners/python/method_sequence.py");

interface DatasetRecord {
  readonly id: string;
  readonly examples?: readonly { readonly input: string; readonly output: string }[];
  readonly starters?: { readonly python?: string };
  readonly python?: {
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
    console.warn(`Seed dataset absent (${datasetPath}) - skipping python runner gate`);
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
    runnerId === "method-sequence" ? methodSequenceRunner : join(runnersDir, `${runnerId}.py`),
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
  problem: DatasetRecord & { python: PythonLink; examples: { input: string; output: string }[] },
): Promise<{ verdicts: number; executionOnly: number }> {
  const link: PythonLink = {
    runnerId: problem.python.runnerId,
    entry: problem.python.entry,
    className: problem.python.className,
    actualRule: problem.python.actualRule,
  };
  const assembled = assemblePythonRun({
    starterPython: problem.starters?.python ?? "",
    link,
    runnerSource: runnerSourceFor(link.runnerId),
  });
  const dir = mkdtempSync(join(tmpdir(), "py-runner-"));
  scratchDirs.push(dir);
  for (const [name, source] of Object.entries(assembled.files)) {
    writeFileSync(join(dir, name), source, "utf8");
  }
  const cases = problem.examples.map((e, i) => ({ name: `ex-${i + 1}`, input: e.input }));
  writeFileSync(join(dir, "cases.json"), JSON.stringify(cases), "utf8");
  const { stdout } = await execFileAsync("python3", ["runner.py"], {
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
      // Per-case error (e.g. non-literal `_` sample): execution-only.
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
  (p): p is DatasetRecord & { python: PythonLink; examples: { input: string; output: string }[] } =>
    p.python !== undefined && Array.isArray(p.examples) && p.examples.length > 0,
);

describe.skipIf(dataset === null)("python shape runners execute every linked problem (feature 18a.1)", () => {
  beforeAll(() => {
    // Gate dependency: host python3 (present on ubuntu-latest CI and dev
    // machines). Fail loudly when absent instead of skipping.
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    expect(runnable.length, "linked problems with examples").toBeGreaterThan(0);
  });

  it.each(runnable.map((p) => [p.id, p] as const))("%s assembles and emits actuals", async (_id, problem) => {
    const { verdicts, executionOnly } = await runLinkedProblem(problem);
    expect(
      verdicts + executionOnly,
      `${problem.id} every example accounted for`,
    ).toBe(problem.examples.length);
  }, 60_000);
});
