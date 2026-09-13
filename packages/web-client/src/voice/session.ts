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

// CLI-identical tool surface plus `end_interview` (S1/S3 domain tool), the
// S5 intelligence tools, and the S7a sandbox tools. The model signals done
// via end_interview; the app finalizes (completing -> completed) via POST
// /end — the model never transitions state itself.
export const REALTIME_TOOL_DEFINITIONS: readonly RealtimeToolDefinition[] = [
  {
    type: "function",
    name: "get_current_problem",
    description:
      "Get the current DSA problem the candidate is solving. Call this when the user asks what problem they are solving or needs problem details.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_interview_state",
    description:
      "Get the full current interview state including candidate, interview id, current problem, and basic progress. Use for general interview context questions.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_candidate_performance",
    description:
      "Get candidate performance including response counts and evaluation status. Call when asked about past performance or how the candidate did before.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_interview_configuration",
    description:
      "Get the backend-owned interview configuration (type, difficulty, duration, problem count, topic focus). Call when you need the interview rules instead of guessing them.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_problem_hint",
    description:
      "Get a tiered hint for the current problem (level 1: concept nudge, 2: approach scaffold, 3: detailed plan). Omit level for the next appropriate tier. Hints never contain the solution — relay the hint conversationally without revealing final code. Every hint is counted and visible in evaluation.",
    parameters: {
      type: "object",
      properties: { level: { type: "integer", enum: [1, 2, 3] } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "record_candidate_answer",
    description:
      "Persist what the candidate just said as a backend-owned response (kind: answer, approach, code, question, or note). Call after substantive candidate turns so progress and evaluation stay accurate.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["answer", "approach", "code", "question", "note"] },
        content: { type: "string" },
        // I5-6: the backend accepts an optional problemId, so the model must
        // be able to attach an answer to a specific problem over voice too.
        problemId: { type: "string" },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "submit_solution",
    description:
      "Persist the candidate's code as backend-owned state (language: javascript or python, code: source text, problemId optional). Call when the candidate finishes or updates an implementation. Returns a submissionId for run_code.",
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["javascript", "python"] },
        code: { type: "string" },
        problemId: { type: "string" },
      },
      required: ["language", "code"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "run_code",
    description:
      "Execute a submitted solution against test cases (submissionId defaults to the latest submission; testCases: [{name, args, expected, hidden?}]; timeoutMs optional). Timeout and error outcomes are results — discuss them conversationally. Hidden cases report pass/fail only; never invent their contents.",
    parameters: {
      type: "object",
      properties: {
        submissionId: { type: "string" },
        testCases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              args: { type: "array" },
              expected: {},
              hidden: { type: "boolean" },
            },
            required: ["name", "args", "expected"],
          },
        },
        timeoutMs: { type: "integer" },
      },
      required: ["testCases"],
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
