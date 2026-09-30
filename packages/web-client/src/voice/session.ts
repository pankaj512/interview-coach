// @interview-coach/web-client - Voice Live session wire format (S4).
//
// Mirrors the CLI regression harness
// (/home/pankaj/dev/Projects/InterviewCoachCli/src/voice-session.ts + tools.ts)
// so browser and CLI configure the realtime session identically. The only
// browser-specific difference is auth transport: the CLI sets an `api-key`
// header (node `ws`), which browsers cannot do, so the minted credential is
// appended as a query parameter (documented Voice Live browser pattern).
//
// Session parameters themselves always come from the backend mint
// (POST /api/interviews/:id/voice-session, frozen section 3) - never
// hardcoded here - so frozen-config changes land server-side only.

import type { CodeLanguage, SerializedSubmitVerdict, ToolExecOutcome, VoiceSessionPayload } from "../api/types.js";

export interface RealtimeToolDefinition {
  readonly type: "function";
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required: readonly string[];
    readonly additionalProperties: false;
  };
}

// Phase 8 canonical tool surface (ADR-002 decision 11): five explicit tools.
// The pre-Phase-8 names remain backend/forwarder aliases for CLI-harness
// compatibility but are never advertised to the web model. Hints are
// model-driven conversation (no get_problem_hint tool) and code execution
// stays the client HTTP path; the model records answers/code via
// submit_interview_data, reads state via get_current_interview, and reads
// the live editor via get_candidate_code (answered locally in the browser,
// never forwarded to tool-exec).
export const REALTIME_TOOL_DEFINITIONS: readonly RealtimeToolDefinition[] = [
  {
    type: "function",
    name: "get_current_interview",
    description:
      "Get the current interview: status, configuration (type, difficulty, duration, problem count, topic focus), current problem id, response counts, hint usage, and candidate performance (including submission count and latest run status). Call this for general interview context, rules, or progress questions.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_current_problem",
    description:
      "Get the current DSA problem the candidate is solving. Call this when the user asks what problem they are solving or needs problem details.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_candidate_code",
    description:
      "Get the candidate's current code from the live editor. Call this when the candidate asks what you can see, or when discussing their implementation. The code is the live editor content, which may be newer than the last tested submission.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_last_submission",
    description:
      "Get the candidate's last submitted code from the backend. Call this after a Submit result arrives, or when the candidate refers to submitted code and the live editor may have moved on. Returns found:false when nothing was submitted yet.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "submit_interview_data",
    description:
      "Persist backend-owned interview data. Provide content (with optional kind) to record what the candidate said, or language + code to persist an implementation. Call after substantive candidate turns so progress and evaluation stay accurate.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["answer", "approach", "code", "question", "note"] },
        content: { type: "string" },
        language: { type: "string", enum: ["javascript", "python"] },
        code: { type: "string" },
        problemId: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "end_interview",
    description:
      "Signal that the interview is finished and should be wrapped up. Say your final goodbye to the candidate FIRST, then call end_interview as your very last operation. Say nothing further after the call returns - the application finalizes the interview.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

// Browser WebSocket transport cannot set headers, so the minted credential
// travels as a query parameter. api-key mode is local-dev-only (frozen
// section 7); bearer/Entra browser binding finalizes with S7 auth.
export function buildAuthenticatedVoiceUrl(session: VoiceSessionPayload): string {
  const url = new URL(session.websocketUrl);
  if (session.credential.tokenType === "api-key") {
    url.searchParams.set("api-key", session.credential.token);
  } else {
    url.searchParams.set("access_token", session.credential.token);
  }
  return url.toString();
}

// session.update built from the backend mint (frozen section 3). Field names
// follow the CLI harness (`input_audio_format`, `turn_detection.*_ms`).
// A stored interviewer-voice preference overrides the minted voice; without
// one (or with an empty override) the server value stands.
export function buildSessionUpdate(
  session: VoiceSessionPayload,
  voiceOverride?: string,
): {
  type: "session.update";
  session: Record<string, unknown>;
} {
  const cfg = session.sessionConfig;
  return {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: session.instructions,
      voice: voiceOverride === undefined || voiceOverride === "" ? session.voice : voiceOverride,
      input_audio_format: cfg.audio.inputFormat,
      output_audio_format: cfg.audio.outputFormat,
      turn_detection: {
        type: cfg.turnDetection.type,
        threshold: cfg.turnDetection.threshold,
        speech_duration_ms: cfg.turnDetection.speechDurationMs,
        silence_duration_ms: cfg.turnDetection.silenceDurationMs,
        interrupt_response: cfg.turnDetection.interruptResponse,
        create_response: cfg.turnDetection.createResponse,
      },
      input_audio_echo_cancellation: { type: cfg.echoCancellation },
      input_audio_noise_reduction: { type: cfg.noiseReduction },
      // The server only emits input transcription events when asked; without
      // this the candidate's turns never reach onTranscript or the transcript.
      input_audio_transcription: { model: "whisper-1" },
      tools: [...REALTIME_TOOL_DEFINITIONS],
      tool_choice: "auto",
    },
  };
}

export function buildFunctionCallOutput(
  callId: string,
  output: string,
  previousItemId?: string,
): Record<string, unknown> {
  return {
    type: "conversation.item.create",
    item: { type: "function_call_output", call_id: callId, output },
    ...(previousItemId === undefined || previousItemId === "" ? {} : { previous_item_id: previousItemId }),
  };
}

// Live editor snapshot for get_candidate_code: the reader is registered by
// the editor owner and answered locally in the browser, so the model sees
// the current content without a backend round trip.
export interface LiveCodeSnapshot {
  readonly language: CodeLanguage;
  readonly code: string;
}

export type LiveCodeReader = () => LiveCodeSnapshot | null;

export interface CandidateCodeResult {
  readonly language: CodeLanguage;
  readonly code: string;
  readonly truncated: boolean;
}

// Bound the code text sent as a tool result; the model discusses the
// implementation from this snapshot while the candidate keeps editing.
const CANDIDATE_CODE_MAX_CHARS = 8000;

export function buildCandidateCodeResult(snapshot: LiveCodeSnapshot): CandidateCodeResult {
  if (snapshot.code.length <= CANDIDATE_CODE_MAX_CHARS) {
    return { language: snapshot.language, code: snapshot.code, truncated: false };
  }
  return {
    language: snapshot.language,
    code: snapshot.code.slice(-CANDIDATE_CODE_MAX_CHARS),
    truncated: true,
  };
}

// Local get_candidate_code execution: same ToolExecOutcome shape as the
// backend tool-exec path so the forwarder ledger treats it identically.
// A missing reader is permanent model-facing data (never retried).
export function resolveCandidateCode(
  callId: string,
  reader: LiveCodeReader | null | undefined,
): ToolExecOutcome {
  const snapshot = reader?.() ?? null;
  if (snapshot === null) {
    return {
      ok: false,
      status: 404,
      code: "NO_EDITOR_CONTENT",
      message: "No editor content is available right now.",
      retryable: false,
      callId,
      tool: "get_candidate_code",
      replayed: false,
    };
  }
  return {
    ok: true,
    callId,
    tool: "get_candidate_code",
    result: buildCandidateCodeResult(snapshot),
    replayed: false,
  };
}

// Fix B push: short verdict summary framed for the live session. The
// verdict lists are already capped by the backend validator, so this is a
// pure join with empty segments omitted.
export function buildVerdictPushSummary(verdict: SerializedSubmitVerdict): string {
  const parts = [
    `correctness: ${verdict.correctness}`,
    `optimality: ${verdict.optimality}`,
    verdict.summary,
  ];
  if (verdict.breakPoints.length > 0) parts.push(`Break-points: ${verdict.breakPoints.join("; ")}`);
  if (verdict.edgeCases.length > 0) parts.push(`Edge cases: ${verdict.edgeCases.join("; ")}`);
  return parts.join(" ");
}

// Resume continuity: the realtime API has no session resumption, so a resumed
// interview replays its pre-pause transcript turns as conversation items and
// the model continues instead of re-greeting. Only spoken turns travel;
// tool, connection, and empty entries never become model context.
export interface ResumeTurn {
  readonly kind: string;
  readonly detail: string;
}

const RESUME_MAX_TURNS = 30;
const RESUME_MAX_CHARS = 8000;

export function buildResumeHistory(events: readonly ResumeTurn[]): Record<string, unknown>[] {
  const turns: { role: string; text: string }[] = [];
  for (const event of events) {
    const text = event.detail.trim();
    if (text === "") continue;
    if (event.kind === "candidate") turns.push({ role: "user", text });
    else if (event.kind === "assistant") turns.push({ role: "assistant", text });
  }
  const recent = turns.slice(-RESUME_MAX_TURNS);
  let chars = recent.reduce((sum, turn) => sum + turn.text.length, 0);
  let start = 0;
  while (start < recent.length - 1 && chars > RESUME_MAX_CHARS) {
    chars -= recent[start]?.text.length ?? 0;
    start += 1;
  }
  let kept = recent.slice(start);
  if (kept.length === 1 && chars > RESUME_MAX_CHARS) {
    const only = kept[0];
    if (only !== undefined) kept = [{ role: only.role, text: only.text.slice(-RESUME_MAX_CHARS) }];
  }
  if (kept.length === 0) return [];
  return [
    ...kept.map((turn) => ({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: turn.role,
        content: [{ type: turn.role === "assistant" ? "output_text" : "input_text", text: turn.text }],
      },
    })),
    {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "The interview was paused and has now resumed. Continue exactly where you left off. Do not greet again or restate the problem.",
          },
        ],
      },
    },
  ];
}
