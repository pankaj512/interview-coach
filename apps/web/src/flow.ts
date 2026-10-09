// @interview-coach/web - interview ritual flow types.
//
// Owns: the shared contract between Lobby, LiveScreen, and the App router
// (recommendation + resolved problem carried forward, no manual setup).
//
// History: Phase 6; see docs/SESSION_HANDOFF.md.

import type {
  ProblemContent,
  SerializedCurriculum,
  SerializedInterview,
  SerializedRecommendation,
} from "./api/types.js";

export type InterviewMode = "Realistic Interview" | "Guided Coaching";
export type Interaction = "Voice" | "Text";
export type Difficulty = "Easy" | "Medium" | "Hard";

export interface SessionPlan {
  readonly interview: SerializedInterview;
  /** The recommendation this session was started from (Phase 5 CTA). */
  readonly recommendation: SerializedRecommendation | null;
  /** The recommended problem, resolved for display (may be null if unavailable). */
  readonly problem: ProblemContent | null;
  /** Curriculum used to resolve topic/module names for the Lobby. */
  readonly curriculum: SerializedCurriculum | null;
  readonly mode: InterviewMode;
  readonly interaction: Interaction;
  readonly durationMinutes: number;
  readonly difficulty: Difficulty;
}
