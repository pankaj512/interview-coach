import { describe, expect, it } from "vitest";
import { asUserId } from "../src/ids.js";
import type { Interview } from "../src/interview.js";
import { createInterview } from "../src/interview.js";
import {
  allowedTransitions,
  canTransition,
  transition,
} from "../src/lifecycle.js";
import { must, mustErr } from "./helpers.js";

const NOW = new Date("2026-09-11T10:00:00.000Z");
const LATER = new Date("2026-09-11T10:05:00.000Z");

function fresh(): Interview {
  return must(
    createInterview({
      candidateId: asUserId("user_test"),
      configuration: { interviewType: "dsa" },
      now: NOW,
    }),
  );
}

describe("interview lifecycle", () => {
  it("walks the happy path created -> ready -> in_progress -> completing -> completed", () => {
    let iv = fresh();
    for (const next of ["ready", "in_progress", "completing", "completed"] as const) {
      iv = must(transition(iv, next, LATER));
    }
    expect(iv.status).toBe("completed");
    expect(iv.startedAt).toEqual(LATER);
    expect(iv.endedAt).toEqual(LATER);
    expect(iv.updatedAt).toEqual(LATER);
  });

  it("supports pause and resume without losing startedAt", () => {
    let iv = must(transition(fresh(), "ready", NOW));
    iv = must(transition(iv, "in_progress", NOW));
    iv = must(transition(iv, "paused", LATER));
    expect(iv.status).toBe("paused");
    expect(iv.startedAt).toEqual(NOW);
    expect(iv.endedAt).toBeUndefined();
    iv = must(transition(iv, "in_progress", LATER));
    expect(iv.startedAt).toEqual(NOW);
  });

  it("rejects illegal jumps", () => {
    expect(mustErr(transition(fresh(), "in_progress", NOW))).toBe(
      "ILLEGAL_TRANSITION",
    );
    expect(mustErr(transition(fresh(), "completed", NOW))).toBe(
      "ILLEGAL_TRANSITION",
    );
  });

  it("treats completed/cancelled/failed as terminal", () => {
    for (const terminal of ["completed", "cancelled", "failed"] as const) {
      expect(allowedTransitions(terminal)).toEqual([]);
      expect(canTransition(terminal, "in_progress")).toBe(false);
    }
  });

  it("allows cancel from created but not fail", () => {
    expect(must(transition(fresh(), "cancelled", NOW)).status).toBe("cancelled");
    expect(mustErr(transition(fresh(), "failed", NOW))).toBe(
      "ILLEGAL_TRANSITION",
    );
  });

  it("exposes the in_progress fan-out", () => {
    expect(allowedTransitions("in_progress")).toEqual([
      "paused",
      "completing",
      "cancelled",
      "failed",
    ]);
  });
});
