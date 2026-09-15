// Phase 9 history mapping: server summaries -> the HistoryEntry view model.

import { describe, expect, it } from "vitest";
import type { SerializedInterviewSummary } from "../src/api/types.js";
import { historyEntriesFromSummaries, historyEntryFromSummary } from "../src/history.js";

function summary(
  overrides: Partial<SerializedInterviewSummary["interview"]> = {},
  evaluation: SerializedInterviewSummary["evaluation"] = null,
): SerializedInterviewSummary {
  return {
    interview: {
      id: "iv_1",
      candidateId: "user_1",
      type: "dsa",
      status: "completed",
      configuration: { interviewType: "dsa", difficulty: "Medium", durationMinutes: 30, problemCount: 1 },
      problems: [{ problemId: "prob_move-zeroes", order: 0 }],
      currentOrder: 0,
      evaluationStatus: "completed",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(60_000).toISOString(),
      ...overrides,
    },
    evaluation,
  };
}

describe("history view model", () => {
  it("maps an interview with no evaluation", () => {
    const entry = historyEntryFromSummary(summary());
    expect(entry).toMatchObject({
      id: "iv_1",
      candidateId: "user_1",
      status: "completed",
      interviewType: "Coding",
      difficulty: "Medium",
      durationMin: 30,
    });
    expect(entry.overallScore).toBeUndefined();
    expect(entry.dimensions).toBeUndefined();
  });

  it("maps the latest evaluation into scores/dimensions/strengths", () => {
    const entry = historyEntryFromSummary(
      summary(
        { startedAt: new Date(0).toISOString(), endedAt: new Date(90_000).toISOString() },
        {
          id: "eval_1",
          interviewId: "iv_1",
          status: "completed",
          dimensions: { correctness: { score: 4 }, communication: { score: 3 } },
          hintsUsed: 2,
          strengths: ["clear reasoning"],
          weaknesses: ["edge cases"],
          recommendation: "continue_topic",
          overallScore: 7,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        },
      ),
    );
    expect(entry.overallScore).toBe(7);
    expect(entry.hintsUsed).toBe(2);
    expect(entry.durationMin).toBe(2);
    expect(entry.dimensions).toEqual({ correctness: 4, communication: 3 });
    expect(entry.strengths).toEqual(["clear reasoning"]);
    expect(entry.weaknesses).toEqual(["edge cases"]);
  });

  it("maps a list in order", () => {
    const entries = historyEntriesFromSummaries([
      summary({ id: "iv_new" }),
      summary({ id: "iv_old" }),
    ]);
    expect(entries.map((e) => e.id)).toEqual(["iv_new", "iv_old"]);
  });
});
