// @interview-coach/backend — in-memory operational counters (HLD 8.4, S8a).
//
// Single-process JSON counters behind GET /api/metrics (auth-gated like the
// rest of /api). No Prometheus dependency in S8a; the shape is deliberately
// trivially scrapable so S8b can swap in a real exporter without touching
// call sites. Resets on process restart (documented, not hidden).

import type { InterviewStatus } from "@interview-coach/domain";

// Domain CodeRun.status values (submission.ts): passed/failed/timeout/error.
export type CodeRunStatus = "passed" | "failed" | "timeout" | "error";

export interface MetricsSnapshot {
  readonly uptimeSeconds: number;
  readonly interviewsCreated: number;
  readonly interviewsDeleted: number;
  // F8-7: per-status lifecycle transitions make completion/failure rate
  // derivable (the previous created/deleted counters alone could not).
  readonly interviewTransitions: Record<InterviewStatus, number>;
  readonly evaluationsRecorded: number;
  readonly authRegistrations: number;
  readonly authLogins: number;
  readonly authFailures: number;
  readonly profilesUpdated: number;
  readonly toolExecuted: number;
  readonly toolReplayed: number;
  readonly toolFailed: number;
  readonly voiceMinted: number;
  readonly voiceRejected: number;
  readonly codeRuns: Record<CodeRunStatus, number>;
  readonly codeSubmissions: number;
  readonly activeVoiceSessions: number;
  readonly idempotencySize: number;
}

export class BackendMetrics {
  private readonly startedAt = Date.now();
  private interviewsCreated = 0;
  private interviewsDeleted = 0;
  private readonly interviewTransitions: Record<InterviewStatus, number> = {
    created: 0,
    ready: 0,
    in_progress: 0,
    paused: 0,
    completing: 0,
    completed: 0,
    cancelled: 0,
    failed: 0,
  };
  private evaluationsRecorded = 0;
  private authRegistrations = 0;
  private authLogins = 0;
  private authFailures = 0;
  private profilesUpdated = 0;
  private toolExecuted = 0;
  private toolReplayed = 0;
  private toolFailed = 0;
  private voiceMinted = 0;
  private voiceRejected = 0;
  private codeSubmissions = 0;
  private readonly codeRuns: Record<CodeRunStatus, number> = {
    passed: 0,
    failed: 0,
    timeout: 0,
    error: 0,
  };

  countInterviewCreated(): void {
    this.interviewsCreated += 1;
  }

  countInterviewDeleted(): void {
    this.interviewsDeleted += 1;
  }

  countInterviewTransition(status: InterviewStatus): void {
    this.interviewTransitions[status] += 1;
  }

  countEvaluationRecorded(): void {
    this.evaluationsRecorded += 1;
  }

  countAuthRegistered(): void {
    this.authRegistrations += 1;
  }

  countAuthLogin(): void {
    this.authLogins += 1;
  }

  countAuthFailure(): void {
    this.authFailures += 1;
  }

  countProfileUpdated(): void {
    this.profilesUpdated += 1;
  }

  countTool(replayed: boolean, ok: boolean): void {
    if (replayed) this.toolReplayed += 1;
    else this.toolExecuted += 1;
    if (!ok) this.toolFailed += 1;
  }

  countVoiceMinted(): void {
    this.voiceMinted += 1;
  }

  countVoiceRejected(): void {
    this.voiceRejected += 1;
  }

  countCodeSubmission(): void {
    this.codeSubmissions += 1;
  }

  countCodeRun(status: CodeRunStatus): void {
    this.codeRuns[status] += 1;
  }

  snapshot(activeVoiceSessions: number, idempotencySize: number): MetricsSnapshot {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      interviewsCreated: this.interviewsCreated,
      interviewsDeleted: this.interviewsDeleted,
      interviewTransitions: { ...this.interviewTransitions },
      evaluationsRecorded: this.evaluationsRecorded,
      authRegistrations: this.authRegistrations,
      authLogins: this.authLogins,
      authFailures: this.authFailures,
      profilesUpdated: this.profilesUpdated,
      toolExecuted: this.toolExecuted,
      toolReplayed: this.toolReplayed,
      toolFailed: this.toolFailed,
      voiceMinted: this.voiceMinted,
      voiceRejected: this.voiceRejected,
      codeRuns: { ...this.codeRuns },
      codeSubmissions: this.codeSubmissions,
      activeVoiceSessions,
      idempotencySize,
    };
  }
}
