// S6 next-practice link (H-Results → dsa-interview-curriculum.json).
//
// The curriculum file is the canonical pedagogical ordering over the same
// 300 problems (Learn → Practice → Interview Ready → Mastered). The client
// bundles it read-only and suggests the first module whose topic matches a
// persisted weakness or the interview's topic focus; otherwise it suggests
// the foundations module. No model output involved.

import curriculumData from "../../../dsa-interview-curriculum.json" with { type: "json" };

interface CurriculumTopic {
  readonly topic?: unknown;
  readonly problem_titles?: unknown;
}

interface CurriculumModule {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly topics?: unknown;
}

export interface NextPractice {
  /** Module id + name, e.g. "01 · Foundations & Core Linear Structures". */
  readonly label: string;
  /** Why this module was suggested (weakness match vs topic-focus vs default). */
  readonly reason: string;
  /** Practice titles from the module (first few, for display). */
  readonly sampleProblems: readonly string[];
}

interface CurriculumShape {
  readonly modules?: readonly CurriculumModule[];
}

function moduleTopics(module: CurriculumModule): readonly string[] {
  if (!Array.isArray(module.topics)) return [];
  const out: string[] = [];
  for (const entry of module.topics as readonly CurriculumTopic[]) {
    if (typeof entry === "object" && entry !== null && typeof entry.topic === "string") {
      out.push(entry.topic);
    }
  }
  return out;
}

function moduleSamples(module: CurriculumModule, limit: number): readonly string[] {
  if (!Array.isArray(module.topics)) return [];
  const out: string[] = [];
  for (const entry of module.topics as readonly CurriculumTopic[]) {
    if (typeof entry !== "object" || entry === null || !Array.isArray(entry.problem_titles)) continue;
    for (const title of entry.problem_titles as readonly unknown[]) {
      if (typeof title === "string") {
        out.push(title);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function moduleLabel(module: CurriculumModule): string {
  const id = typeof module.id === "string" ? module.id : "?";
  const name = typeof module.name === "string" ? module.name : "Curriculum module";
  return `${id} · ${name}`;
}

function matchesTopic(haystack: string, needle: string): boolean {
  const hay = haystack.toLowerCase();
  const clean = needle.toLowerCase().trim();
  if (clean === "") return false;
  return hay.includes(clean) || clean.split(/[^a-z0-9]+/).filter((w) => w.length > 3).some((w) => hay.includes(w));
}

/** Suggest the next curriculum module from persisted weaknesses + topic focus. */
export function nextPractice(input: {
  readonly weaknesses: readonly string[];
  readonly topicFocus: readonly string[];
}): NextPractice {
  const shape = curriculumData as CurriculumShape;
  const modules = Array.isArray(shape.modules) ? shape.modules : [];
  const fallback: NextPractice = {
    label: modules.length > 0 ? moduleLabel(modules[0] as CurriculumModule) : "Curriculum",
    reason: "Start at the foundations module of dsa-interview-curriculum.json.",
    sampleProblems: modules.length > 0 ? moduleSamples(modules[0] as CurriculumModule, 3) : [],
  };
  if (modules.length === 0) return fallback;

  const needles = [...input.weaknesses, ...input.topicFocus].filter((s) => s.trim() !== "");
  for (const needle of needles) {
    for (const module of modules) {
      const topics = moduleTopics(module);
      if (topics.some((t) => matchesTopic(t, needle) || matchesTopic(needle, t))) {
        const fromWeakness = input.weaknesses.some((w) => w.trim() !== "" && (matchesTopic(needle, w) || needle === w));
        return {
          label: moduleLabel(module),
          reason: fromWeakness
            ? `Matches a recorded weakness ("${needle}").`
            : `Continues your topic focus ("${needle}").`,
          sampleProblems: moduleSamples(module, 3),
        };
      }
    }
  }
  // Topic-focus fallback: echo the focus even without a module keyword match.
  if (input.topicFocus.length > 0) {
    return { ...fallback, reason: `Continue ${input.topicFocus.join(", ")} from dsa-interview-curriculum.json.` };
  }
  return fallback;
}
