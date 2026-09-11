import type { EventId, InterviewId } from "./ids.js";
import { newEventId } from "./ids.js";

// Append-only interview event log (HLD 5.12). Lifecycle/timing events only;
// never per-PCM-chunk or raw audio.
export type InterviewEventType =
  | "interview.created"
  | "interview.ready"
  | "interview.started"
  | "interview.paused"
  | "interview.resumed"
  | "interview.completing"
  | "interview.completed"
  | "interview.cancelled"
  | "interview.failed"
  | "problem.assigned"
  | "problem.activated"
  | "response.recorded"
  | "hint.issued"
  | "code.submitted"
  | "code.executed"
  | "evaluation.recorded"
  | "tool.invoked"
  | "tool.failed";

export interface InterviewEvent {
  readonly id: EventId;
  readonly interviewId: InterviewId;
  readonly type: InterviewEventType;
  readonly payload?: Record<string, unknown>;
  readonly occurredAt: Date;
}

export function buildEvent(
  interviewId: InterviewId,
  type: InterviewEventType,
  occurredAt: Date,
  payload?: Record<string, unknown>,
): InterviewEvent {
  return {
    id: newEventId(),
    interviewId,
    type,
    occurredAt,
    ...(payload === undefined ? {} : { payload }),
  };
}
