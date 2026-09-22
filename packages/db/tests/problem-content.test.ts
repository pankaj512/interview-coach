// Feature 18a.1/18a.2 gate (dataset shape): the committed problem-content
// dataset must exactly cover the catalog with cleaned copy, verbatim
// starters, and resolvable Python/JavaScript runner links. Reads
// PROBLEM_CONTENT_PATH when set (used to prove the gate rejects a broken
// dataset), otherwise the repo-root dataset this feature generates.
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { slugifyTitle } from "@interview-coach/domain";

const here = dirname(fileURLToPath(import.meta.url));
const datasetPath =
  process.env.PROBLEM_CONTENT_PATH ?? resolve(here, "../../../problem-content-enrichment.json");
const catalogPath = resolve(here, "../../../dsa-problem-catalog.json");
const runnersDir = resolve(
  here,
  "../../../packages/backend/src/shape-runners/python/runners",
);
const methodSequenceRunner = resolve(
  here,
  "../../../packages/backend/src/shape-runners/python/method_sequence.py",
);
const jsRunnersDir = resolve(
  here,
  "../../../packages/backend/src/shape-runners/javascript/runners",
);
const jsMethodSequenceRunner = resolve(
  here,
  "../../../packages/backend/src/shape-runners/javascript/method_sequence.js",
);

interface DatasetExample {
  readonly input: unknown;
  readonly output: unknown;
  readonly explanation?: unknown;
}

interface DatasetRecord {
  readonly id: unknown;
  readonly title: unknown;
  readonly description?: unknown;
  readonly constraints?: unknown;
  readonly examples?: readonly DatasetExample[];
  readonly starters?: {
    readonly cpp?: unknown;
    readonly javascript?: unknown;
    readonly python?: unknown;
  };
  readonly python?: {
    readonly runnerId?: unknown;
    readonly entry?: unknown;
    readonly className?: unknown;
    readonly actualRule?: unknown;
  };
  readonly javascript?: {
    readonly runnerId?: unknown;
    readonly entry?: unknown;
    readonly className?: unknown;
    readonly actualRule?: unknown;
  };
}

const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as {
  version: unknown;
  count: unknown;
  problems: readonly DatasetRecord[];
};
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
  topics: readonly {
    problems: readonly { title: string }[];
  }[];
};
const catalogIds = new Set<string>();
for (const { problems } of catalog.topics) {
  for (const p of problems) catalogIds.add(`prob_${slugifyTitle(p.title)}`);
}

function runnerFile(runnerId: string): string {
  return runnerId === "method-sequence"
    ? methodSequenceRunner
    : resolve(runnersDir, `${runnerId}.py`);
}

function jsRunnerFile(runnerId: string): string {
  return runnerId === "method-sequence"
    ? jsMethodSequenceRunner
    : resolve(jsRunnersDir, `${runnerId}.js`);
}

describe("problem-content dataset (feature 18a.1)", () => {
  it("covers exactly the catalog", () => {
    expect(dataset.version).toBe(1);
    expect(dataset.count).toBe(300);
    expect(dataset.problems).toHaveLength(300);
    expect(new Set(dataset.problems.map((p) => p.id))).toEqual(catalogIds);
  });

  it("every problem has cleaned copy and verbatim starters", () => {
    for (const p of dataset.problems) {
      expect(typeof p.description, `${p.id} description`).toBe("string");
      expect((p.description as string).trim().length, `${p.id} description`).toBeGreaterThan(0);
      expect(Array.isArray(p.constraints), `${p.id} constraints`).toBe(true);
      expect((p.constraints as unknown[]).length, `${p.id} constraints`).toBeGreaterThan(0);
      for (const c of p.constraints as unknown[]) {
        expect(typeof c, `${p.id} constraint`).toBe("string");
        expect((c as string).trim().length, `${p.id} constraint`).toBeGreaterThan(0);
      }
      const starters = p.starters;
      for (const lang of ["cpp", "javascript", "python"] as const) {
        expect(typeof starters?.[lang], `${p.id} ${lang} starter`).toBe("string");
        expect(
          (starters?.[lang] as string).trim().length,
          `${p.id} ${lang} starter`,
        ).toBeGreaterThan(0);
      }
      expect(starters?.python as string, `${p.id} python class`).toContain("class ");
      expect(starters?.python as string, `${p.id} python def`).toContain("def ");
    }
  });

  it("examples are valid strings with array-encoded list/tree samples", () => {
    const nodeNotation = /[A-Za-z_]*ListNode\s*\(|[A-Za-z_]*TreeNode\s*\(/;
    for (const p of dataset.problems) {
      if (p.examples === undefined) continue;
      for (const e of p.examples) {
        expect(typeof e.input, `${p.id} example input`).toBe("string");
        expect(typeof e.output, `${p.id} example output`).toBe("string");
        expect((e.input as string).trim().length, `${p.id} example input`).toBeGreaterThan(0);
        expect((e.output as string).trim().length, `${p.id} example output`).toBeGreaterThan(0);
        if (e.explanation !== undefined) {
          expect(typeof e.explanation, `${p.id} example explanation`).toBe("string");
        }
        expect(nodeNotation.test(e.input as string), `${p.id} no ListNode/TreeNode input`).toBe(
          false,
        );
        expect(nodeNotation.test(e.output as string), `${p.id} no ListNode/TreeNode output`).toBe(
          false,
        );
      }
    }
  });

  it("every python link resolves to an existing runner and names its entry", () => {
    let linked = 0;
    for (const p of dataset.problems) {
      if (p.python === undefined) continue;
      linked += 1;
      const { runnerId, entry, className, actualRule } = p.python;
      expect(typeof runnerId, `${p.id} runnerId`).toBe("string");
      expect(existsSync(runnerFile(runnerId as string)), `${p.id} runner file`).toBe(true);
      expect(typeof className, `${p.id} className`).toBe("string");
      expect((className as string).trim().length, `${p.id} className`).toBeGreaterThan(0);
      expect(
        (p.starters?.python as string).includes(`class ${className as string}`),
        `${p.id} starter defines linked class`,
      ).toBe(true);
      expect(["pure", "in-place", "method-sequence"], `${p.id} actualRule`).toContain(actualRule);
      if (actualRule !== "method-sequence") {
        expect(typeof entry, `${p.id} entry`).toBe("string");
        expect((entry as string).trim().length, `${p.id} entry`).toBeGreaterThan(0);
        expect(
          (p.starters?.python as string).includes(`def ${entry as string}(`),
          `${p.id} starter defines entry method`,
        ).toBe(true);
      }
    }
    expect(linked, "linked problems").toBeGreaterThan(0);
  });

  it("every javascript link resolves to an existing runner and names its entry", () => {
    let linked = 0;
    for (const p of dataset.problems) {
      if (p.javascript === undefined) continue;
      linked += 1;
      const { runnerId, entry, className, actualRule } = p.javascript;
      expect(typeof runnerId, `${p.id} runnerId`).toBe("string");
      expect(existsSync(jsRunnerFile(runnerId as string)), `${p.id} runner file`).toBe(true);
      expect(["pure", "in-place", "method-sequence"], `${p.id} actualRule`).toContain(actualRule);
      const starter = p.starters?.javascript as string;
      if (actualRule === "method-sequence") {
        expect(typeof className, `${p.id} className`).toBe("string");
        expect((className as string).trim().length, `${p.id} className`).toBeGreaterThan(0);
        expect(
          starter.includes(className as string),
          `${p.id} starter defines linked constructor`,
        ).toBe(true);
      } else {
        expect(typeof entry, `${p.id} entry`).toBe("string");
        expect((entry as string).trim().length, `${p.id} entry`).toBeGreaterThan(0);
        expect(
          new RegExp(`\\b${entry as string}\\s*=\\s*function\\b`).test(starter),
          `${p.id} starter defines entry function`,
        ).toBe(true);
      }
    }
    expect(linked, "linked problems").toBeGreaterThan(0);
  });
});
