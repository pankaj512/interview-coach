// @interview-coach/web-client — Voice Live session wire format (S4).
//
// Mirrors the CLI regression harness
// (/home/pankaj/dev/Projects/InterviewCoachCli/src/voice-session.ts + tools.ts)
// so browser and CLI configure the realtime session identically. The only
// browser-specific difference is auth transport: the CLI sets an `api-key`
// header (node `ws`), which browsers cannot do, so the minted credential is
// appended as a query parameter (documented Voice Live browser pattern).
//
// Session parameters themselves always come from the backend mint
// (POST /api/interviews/:id/voice-session, frozen section 3) — never
// hardcoded here — so frozen-config changes land server-side only.

import type { VoiceSessionPayload } from "../api/types.js";

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

// Phase 8 canonical tool surface (ADR-002 decision 11): four explicit tools.
// The pre-Phase-8 names remain backend/forwarder aliases for CLI-harness
// compatibility but are never advertised to the web model. Hints are
// model-driven conversation (no get_problem_hint tool) and code execution
// stays the client HTTP path; the model records answers/code via
// submit_interview_data and reads state via get_current_interview.
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
      "Signal that the interview is finished and should be wrapped up. Call when the candidate has completed the discussion or explicitly wants to end. The application finalizes the interview; continue the conversation naturally afterwards.",
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
export function buildSessionUpdate(session: VoiceSessionPayload): {
  type: "session.update";
  session: Record<string, unknown>;
} {
  const cfg = session.sessionConfig;
  return {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: session.instructions,
      voice: session.voice,
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
