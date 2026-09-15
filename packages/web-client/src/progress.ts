// Progress + weak-area derivations (ux-spec §27–§29).
//
// Pure functions over server-owned state: interview history summaries (Phase 9)
// plus the skill snapshot/curriculum (Phase 3). No browser-local authority —
// every value here is derived from backend responses.

import type { HistoryEntry } from "./history.js";
import type { SerializedCurriculum, SerializedUserSkillState } from "./api/types.js";
import { findTopic } from "./dashboard.js";

export interface TrendPoint {
  readonly at: string;
  readonly score: number;
}

export interface AreaScore {
  readonly label: string;
  readonly score: number;
}

export interface ProgressSummary {
  readonly count: number;
  readonly scoredCount: number;
  readonly average: number | null;
  readonly trend: readonly TrendPoint[];
  readonly dimensions: readonly AreaScore[];
  readonly types: readonly AreaScore[];
  readonly weaknesses: readonly { label: string; count: number }[];
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function topicLabel(curriculum: SerializedCurriculum | null, topicId: string): string {
  return findTopic(curriculum, topicId)?.name ?? topicId;
}

export function buildProgress(
  entries: readonly HistoryEntry[],
  skills: readonly SerializedUserSkillState[] = [],
  curriculum: SerializedCurriculum | null = null,
): ProgressSummary {
  const scored = entries.filter((e) => typeof e.overallScore === "number");
  const trend: TrendPoint[] = [...scored]
    .reverse()
    .map((e) => ({ at: e.at, score: e.overallScore as number }));
  const overall = average(scored.map((e) => e.overallScore as number));

  const dimTotals = new Map<string, { sum: number; n: number }>();
  for (const entry of scored) {
    if (entry.dimensions === undefined) continue;
    for (const [key, score] of Object.entries(entry.dimensions)) {
      const cur = dimTotals.get(key) ?? { sum: 0, n: 0 };
      cur.sum += score;
      cur.n += 1;
      dimTotals.set(key, cur);
    }
  }
  const dimensions: AreaScore[] = [...dimTotals.entries()]
    .map(([label, { sum, n }]) => ({ label, score: round1(sum / n) }))
    .sort((a, b) => b.score - a.score);

  const typeTotals = new Map<string, { sum: number; n: number }>();
  for (const entry of scored) {
    const label = entry.interviewType ?? "Coding";
    const cur = typeTotals.get(label) ?? { sum: 0, n: 0 };
    cur.sum += entry.overallScore as number;
    cur.n += 1;
    typeTotals.set(label, cur);
  }
  const types: AreaScore[] = [...typeTotals.entries()]
    .map(([label, { sum, n }]) => ({ label, score: round1(sum / n) }))
    .sort((a, b) => b.score - a.score);

  const weakCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const weakness of entry.weaknesses ?? []) {
      const key = weakness.trim();
      if (key === "") continue;
      weakCounts.set(key, (weakCounts.get(key) ?? 0) + 1);
    }
  }
  for (const skill of skills) {
    for (const weakness of skill.weaknesses ?? []) {
      const key = weakness.trim();
      if (key === "") continue;
      weakCounts.set(key, (weakCounts.get(key) ?? 0) + 1);
    }
    if (skill.masteryLevel === "learning" || skill.lastOutcome === "failure") {
      const label = topicLabel(curriculum, skill.topicId);
      weakCounts.set(label, (weakCounts.get(label) ?? 0) + 1);
    }
  }
  const weaknesses = [...weakCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    count: entries.length,
    scoredCount: scored.length,
    average: overall === null ? null : round1(overall),
    trend,
    dimensions,
    types,
    weaknesses,
  };
}

/** Band label for an overall score out of 10 (ux-spec §22 "Strong"). */
export function overallBand(score: number | null): string {
  if (score === null) return "Not yet scored";
  if (score >= 8) return "Strong";
  if (score >= 7) return "Solid";
  if (score >= 5.5) return "Developing";
  return "Needs work";
}

export function formatRecommendation(recommendation: string | undefined): string {
  if (recommendation === undefined || recommendation === "") return "—";
  return recommendation.replace(/_/g, " ");
}
