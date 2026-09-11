// @interview-coach/backend — in-memory operational counters (HLD 8.4, S8a).
//
// Single-process JSON counters behind GET /api/metrics (auth-gated like the
// rest of /api). No Prometheus dependency in S8a; the shape is deliberately
// trivially scrapable so S8b can swap in a real exporter without touching
// call sites. Resets on process restart (documented, not hidden).

// Domain CodeRun.status values (submission.ts): passed/failed/timeout/error.
export type CodeRunStatus = "passed" | "failed" | "timeout" | "error";

export interface MetricsSnapshot {
  readonly uptimeSeconds: number;
  readonly interviewsCreated: number;
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
