import type { Interview, InterviewStatus } from "./interview.js";
import { isTerminalStatus } from "./interview.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

// Application-only lifecycle (frozen): only the app transitions state.
// The model may signal "done" via end_interview; the service maps that to
// `completing`, never directly to `completed`.
const ALLOWED: Record<InterviewStatus, readonly InterviewStatus[]> = {
  created: ["ready", "cancelled"],
  ready: ["in_progress", "cancelled"],
  in_progress: ["paused", "completing", "cancelled", "failed"],
  paused: ["in_progress", "completing", "cancelled", "failed"],
  completing: ["completed", "failed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
};

export function allowedTransitions(from: InterviewStatus): readonly InterviewStatus[] {
  return ALLOWED[from] ?? [];
}

export function canTransition(from: InterviewStatus, to: InterviewStatus): boolean {
  return allowedTransitions(from).includes(to);
}

// Pure transition: validates, stamps updatedAt, sets startedAt on first
// entry to in_progress and endedAt on terminal states.
export function transition(
  interview: Interview,
  to: InterviewStatus,
  now: Date,
): Result<Interview> {
  if (!canTransition(interview.status, to)) {
    return err(
      domainError(
        "ILLEGAL_TRANSITION",
        `Cannot transition interview ${interview.id} from ${interview.status} to ${to}`,
        { from: interview.status, to },
      ),
    );
  }
  const startedAt =
    interview.startedAt ?? (to === "in_progress" ? now : undefined);
  const endedAt =
    interview.endedAt ?? (isTerminalStatus(to) ? now : undefined);
  return ok({
    ...interview,
    status: to,
    updatedAt: now,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(endedAt === undefined ? {} : { endedAt }),
  });
}
