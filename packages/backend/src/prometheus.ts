// @interview-coach/backend — Prometheus text exposition (HLD 8.4, S8b).
//
// Renders the BackendMetrics snapshot in Prometheus text format 0.0.4 for
// scraping (no client library — the snapshot is small integers only, so a
// hand-rolled renderer is exact and dependency-free). Served at
// GET /api/metrics/prometheus, auth-gated like /api/metrics. Counter names
// are stable; S8b+ may only add new series, never rename.

import type { MetricsSnapshot } from "./metrics.js";

function counter(name: string, help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name} ${value}\n`;
}

function gauge(name: string, help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

export function renderPrometheusMetrics(snapshot: MetricsSnapshot): string {
  const lines: string[] = [
    counter(
      "interview_coach_interviews_created_total",
      "Interviews created via POST /api/interviews.",
      snapshot.interviewsCreated,
    ),
    counter(
      "interview_coach_interviews_deleted_total",
      "Interviews hard-deleted via DELETE /api/interviews/:id.",
      snapshot.interviewsDeleted,
    ),
    counter(
      "interview_coach_tool_executions_total",
      "Tool executions (first attempts; replays counted separately).",
      snapshot.toolExecuted,
    ),
    counter(
      "interview_coach_tool_replays_total",
      "Idempotent tool replays served from the call_id store.",
      snapshot.toolReplayed,
    ),
    counter(
      "interview_coach_tool_failures_total",
      "Tool executions and replays that resolved as domain failures.",
      snapshot.toolFailed,
    ),
    counter(
      "interview_coach_voice_sessions_minted_total",
      "Voice session credentials minted.",
      snapshot.voiceMinted,
    ),
    counter(
      "interview_coach_voice_sessions_rejected_total",
      "Voice session requests refused (wrong state, quota, unconfigured).",
      snapshot.voiceRejected,
    ),
    counter(
      "interview_coach_code_submissions_total",
      "Candidate code submissions stored.",
      snapshot.codeSubmissions,
    ),
  ];
  for (const status of ["passed", "failed", "timeout", "error"] as const) {
    lines.push(
      `# HELP interview_coach_code_runs_total Code executions by verdict.\n# TYPE interview_coach_code_runs_total counter\ninterview_coach_code_runs_total{status="${status}"} ${snapshot.codeRuns[status]}\n`,
    );
  }
  lines.push(
    gauge(
      "interview_coach_uptime_seconds",
      "Backend process uptime in seconds.",
      snapshot.uptimeSeconds,
    ),
    gauge(
      "interview_coach_active_voice_sessions",
      "Live entries in the in-memory voice session map.",
      snapshot.activeVoiceSessions,
    ),
    gauge(
      "interview_coach_idempotency_size",
      "Stored call_id records in the in-memory idempotency store.",
      snapshot.idempotencySize,
    ),
  );
  return lines.join("");
}
