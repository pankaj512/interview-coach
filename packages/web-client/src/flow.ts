// @interview-coach/web-client — interview ritual flow types (Phase 6).
//
// The manual Setup screen is retired (roadmap Phase 6): the system chooses the
// practice from the server recommendation. The Lobby is the final pre-interview
// step and carries the recommendation + resolved problem forward to the live
// room. These types are the shared contract between the Lobby, the LiveScreen
// and the App router.

import type {
  Problem,
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
  readonly problem: Problem | null;
  /** Curriculum used to resolve topic/module names for the Lobby. */
  readonly curriculum: SerializedCurriculum | null;
  readonly mode: InterviewMode;
  readonly interaction: Interaction;
  readonly durationMinutes: number;
  readonly difficulty: Difficulty;
}
