// Phase 3 curriculum: import integrity, ordering, title->ID mapping, coverage.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DSA_CURRICULUM_ID,
  findCurriculumTopic,
  importCurriculum,
  moduleIdFor,
  type CurriculumRaw,
} from "../src/curriculum.js";
import { importCatalogTopics, topicIdForName } from "../src/catalog.js";
import { asTopicId } from "../src/ids.js";

const here = dirname(fileURLToPath(import.meta.url));

// Product-only checkouts (CI included) lack the gitignored seed JSONs: load
//-or-null so file-backed tests skip instead of failing collection.
function loadJson<T>(path: string, label: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    console.warn(`Seed file absent (${label}) - skipping curriculum import gate`);
    return null;
  }
}

const curriculumJson = loadJson<CurriculumRaw>(
  resolve(here, "../../../content/dsa/dsa-interview-curriculum.json"),
  "dsa-interview-curriculum.json",
);
const catalogJson = loadJson<{ topics: { topic: string; problems: { title: string }[] }[] }>(
  resolve(here, "../../../raw_content/dsa/dsa-problem-catalog.json"),
  "dsa-problem-catalog.json",
);

function catalogTitles(): ReadonlySet<string> {
  const titles = new Set<string>();
  for (const topic of catalogJson?.topics ?? []) {
    for (const problem of topic.problems) titles.add(problem.title);
  }
  return titles;
}

describe("importCurriculum", () => {
  it.skipIf(curriculumJson === null)(
    "imports the canonical curriculum (12 modules / 59 topics / 300 problems)",
    () => {
      const { curriculum, errors } = importCurriculum(curriculumJson!, {
        knownProblemTitles: catalogTitles(),
      });
      expect(errors).toEqual([]);
      expect(curriculum.id).toBe(DSA_CURRICULUM_ID);
      expect(curriculum.interviewType).toBe("dsa");
      expect(curriculum.modules).toHaveLength(12);
      expect(curriculum.topics).toHaveLength(59);
      const problemCount = curriculum.topics.reduce(
        (sum, t) => sum + t.problemIds.length,
        0,
      );
      expect(problemCount).toBe(300);
    },
  );

  it.skipIf(curriculumJson === null)("orders modules and topics deterministically", () => {
    const { curriculum } = importCurriculum(curriculumJson!);
    expect(curriculum.modules.map((m) => m.order)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(curriculum.topics.map((t) => t.order)).toEqual(
      Array.from({ length: 59 }, (_, i) => i + 1),
    );
    // Modules own exactly the topics whose moduleId points at them.
    for (const module of curriculum.modules) {
      const owned = curriculum.topics.filter((t) => t.moduleId === module.id);
      expect(module.topicIds).toEqual(owned.map((t) => t.id));
    }
  });

  it.skipIf(curriculumJson === null)(
    "maps problem titles to the same stable IDs the catalog seed uses",
    () => {
      const { curriculum } = importCurriculum(curriculumJson!);
    const arrays = findCurriculumTopic(curriculum, topicIdForName("Arrays"));
    expect(arrays).not.toBeNull();
    expect(arrays?.name).toBe("Arrays");
    expect(arrays?.problemIds[0]).toBe("prob_move-zeroes");
    expect(moduleIdFor(DSA_CURRICULUM_ID, "01")).toBe("module_dsa_01");
    },
  );

  it.skipIf(curriculumJson === null || catalogJson === null)(
    "covers every catalog problem exactly once",
    () => {
      const { curriculum } = importCurriculum(curriculumJson!);
      const seeded = importCatalogTopics(
        catalogJson!.topics.map((t) => ({
          topic: t.topic,
          problems: t.problems.map((p) => ({
            title: p.title,
            difficulty: "Easy",
          })),
        })),
      ).problems;
      const curriculumIds = new Set(
        curriculum.topics.flatMap((t) => [...t.problemIds]),
      );
      expect(curriculumIds.size).toBe(seeded.length);
      for (const problem of seeded) expect(curriculumIds.has(problem.id)).toBe(true);
    },
  );

  it("reports unknown titles and duplicates without throwing", () => {
    const { curriculum, errors } = importCurriculum(
      {
        name: "Test",
        version: 2,
        modules: [
          {
            id: "01",
            name: "M1",
            topics: [
              { topic: "Arrays", problem_titles: ["Move Zeroes", "Ghost Problem"] },
              { topic: "Arrays", problem_titles: ["Rotate Array"] },
            ],
          },
        ],
      },
      { knownProblemTitles: new Set(["Move Zeroes"]) },
    );
    expect(curriculum.version).toBe(2);
    expect(curriculum.topics).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain("not found");
    expect(errors[1]?.message).toContain("Duplicate topic");
  });

  it.skipIf(curriculumJson === null)("is deterministic across repeated imports", () => {
    const a = importCurriculum(curriculumJson!).curriculum;
    const b = importCurriculum(curriculumJson!).curriculum;
    expect(a).toEqual(b);
  });

  it.skipIf(curriculumJson === null)("returns null for a missing topic lookup", () => {
    const { curriculum } = importCurriculum(curriculumJson!);
    expect(findCurriculumTopic(curriculum, asTopicId("topic_nope"))).toBeNull();
  });
});
