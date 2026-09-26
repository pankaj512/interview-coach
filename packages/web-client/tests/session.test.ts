// Session wire-format tests (S4): CLI-compatible session.update + browser
// credential transport. No network.
import { describe, expect, it } from "vitest";
import type { VoiceSessionPayload } from "../src/api/types.js";
import {
  buildAuthenticatedVoiceUrl,
  buildCandidateCodeResult,
  buildFunctionCallOutput,
  buildResumeHistory,
  buildSessionUpdate,
  resolveCandidateCode,
  REALTIME_TOOL_DEFINITIONS,
  type ResumeTurn,
} from "../src/voice/session.js";

function mint(overrides: Partial<VoiceSessionPayload> = {}): VoiceSessionPayload {
  return {
    websocketUrl: "wss://voice.example/voice-live/realtime?api-version=2026-04-10&model=gpt-realtime-mini",
    endpoint: "https://voice.example",
    model: "gpt-realtime-mini",
    apiVersion: "2026-04-10",
    voice: "alloy",
    ttlSeconds: 600,
    expiresAt: "2026-09-11T00:10:00.000Z",
    credential: { tokenType: "api-key", token: "dev-only-key" },
    credentialMode: "api-key-local-dev",
    sessionConfig: {
      audio: { inputFormat: "pcm16", outputFormat: "pcm16", sampleRateHz: 24_000, channels: 1 },
      turnDetection: {
        type: "server_vad",
        threshold: 0.35,
        speechDurationMs: 80,
        silenceDurationMs: 500,
        interruptResponse: true,
        createResponse: true,
      },
      echoCancellation: "server_echo_cancellation",
      noiseReduction: "azure_deep_noise_suppression",
    },
    instructions: "interview instructions",
    ...overrides,
  };
}

describe("session wire format", () => {
  it("advertises the five canonical Phase 8 tools", () => {
    expect(REALTIME_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "get_current_interview",
      "get_current_problem",
      "get_candidate_code",
      "submit_interview_data",
      "end_interview",
    ]);
    for (const tool of REALTIME_TOOL_DEFINITIONS) {
      expect(tool.type).toBe("function");
      expect(tool.parameters.additionalProperties).toBe(false);
    }
  });

  it("declares the get_candidate_code tool with no required arguments", () => {
    const byName = new Map(REALTIME_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
    const code = byName.get("get_candidate_code");
    expect(code?.type).toBe("function");
    expect(code?.parameters.required).toEqual([]);
    expect(code?.parameters.additionalProperties).toBe(false);
  });

  it("builds the live code result without truncating short code", () => {
    expect(buildCandidateCodeResult({ language: "python", code: "def solve():\n  pass\n" })).toEqual({
      language: "python",
      code: "def solve():\n  pass\n",
      truncated: false,
    });
  });

  it("passes empty editor content through untruncated", () => {
    expect(buildCandidateCodeResult({ language: "javascript", code: "" })).toEqual({
      language: "javascript",
      code: "",
      truncated: false,
    });
  });

  it("truncates long code to the trailing window and flags it", () => {
    const code = `${"x".repeat(7991)}0123456789`;
    const result = buildCandidateCodeResult({ language: "cpp", code });
    expect(result.truncated).toBe(true);
    expect(result.code).toBe(code.slice(-8000));
    expect(result.code).toHaveLength(8000);
  });

  it("resolves a local code outcome without a backend round trip", () => {
    const outcome = resolveCandidateCode("call_1", () => ({ language: "python", code: "pass" }));
    expect(outcome).toEqual({
      ok: true,
      callId: "call_1",
      tool: "get_candidate_code",
      result: { language: "python", code: "pass", truncated: false },
      replayed: false,
    });
  });

  it("resolves a missing reader as a permanent model-facing failure", () => {
    for (const reader of [null, undefined]) {
      const outcome = resolveCandidateCode("call_2", reader ?? undefined);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.retryable).toBe(false);
        expect(outcome.tool).toBe("get_candidate_code");
      }
    }
  });
  it("declares the submit_interview_data argument schema", () => {
    const byName = new Map(REALTIME_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
    const submit = byName.get("submit_interview_data");
    expect(submit?.parameters.properties).toHaveProperty("content");
    expect(submit?.parameters.properties).toHaveProperty("code");
    expect(submit?.parameters.properties).toHaveProperty("language");
    expect(submit?.parameters.required).toEqual([]);
  });

  it("prefers a stored voice override but falls back to the mint", () => {
    expect(buildSessionUpdate(mint(), "sage").session["voice"]).toBe("sage");
    expect(buildSessionUpdate(mint(), "").session["voice"]).toBe("alloy");
    expect(buildSessionUpdate(mint()).session["voice"]).toBe("alloy");
  });

  it("builds a CLI-compatible session.update from the mint", () => {
    const update = buildSessionUpdate(mint());
    expect(update.type).toBe("session.update");
    expect(update.session["modalities"]).toEqual(["text", "audio"]);
    expect(update.session["instructions"]).toBe("interview instructions");
    expect(update.session["voice"]).toBe("alloy");
    expect(update.session["input_audio_format"]).toBe("pcm16");
    expect(update.session["output_audio_format"]).toBe("pcm16");
    expect(update.session["turn_detection"]).toMatchObject({
      type: "server_vad",
      threshold: 0.35,
      speech_duration_ms: 80,
      silence_duration_ms: 500,
      interrupt_response: true,
      create_response: true,
    });
    expect(update.session["input_audio_echo_cancellation"]).toEqual({ type: "server_echo_cancellation" });
    expect(update.session["input_audio_noise_reduction"]).toEqual({ type: "azure_deep_noise_suppression" });
    expect(update.session["tool_choice"]).toBe("auto");
    expect((update.session["tools"] as unknown[]).length).toBe(5);
  });

  it("transports api-key credentials as a query parameter (no header support in browsers)", () => {
    const url = new URL(buildAuthenticatedVoiceUrl(mint()));
    expect(url.searchParams.get("api-key")).toBe("dev-only-key");
    expect(url.searchParams.get("api-version")).toBe("2026-04-10");
    expect(url.searchParams.get("model")).toBe("gpt-realtime-mini");
  });

  it("transports bearer credentials as an access_token parameter", () => {
    const session = mint({ credential: { tokenType: "bearer", token: "eph_123" }, credentialMode: "entra-ephemeral" });
    const url = new URL(buildAuthenticatedVoiceUrl(session));
    expect(url.searchParams.get("access_token")).toBe("eph_123");
    expect(url.searchParams.get("api-key")).toBeNull();
  });

  it("builds function_call_output with previous_item_id correlation", () => {
    expect(buildFunctionCallOutput("c1", "{}")).toMatchObject({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: "c1", output: "{}" },
    });
    const withPrev = buildFunctionCallOutput("c1", "{}", "item_9");
    expect(withPrev["previous_item_id"]).toBe("item_9");
  });
});

describe("resume history", () => {
  const turn = (kind: string, detail: string): ResumeTurn => ({ kind, detail });

  function itemAt(history: Record<string, unknown>[], index: number): Record<string, unknown> {
    return history[index]?.["item"] as Record<string, unknown>;
  }

  it("maps candidate turns to user messages and assistant turns to assistant messages in order", () => {
    const history = buildResumeHistory([
      turn("assistant", "How would you approach this?"),
      turn("candidate", "I would use a hash map."),
    ]);
    expect(history.length).toBe(3);
    expect(itemAt(history, 0)).toMatchObject({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "How would you approach this?" }],
    });
    expect(itemAt(history, 1)).toMatchObject({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "I would use a hash map." }],
    });
  });

  it("ends with a continue nudge instead of a greeting", () => {
    const history = buildResumeHistory([turn("candidate", "Hello")]);
    const nudge = itemAt(history, history.length - 1);
    expect(nudge?.["role"]).toBe("user");
    const content = nudge?.["content"] as { type: string; text: string }[];
    expect(content[0]?.text).toMatch(/Continue exactly where you left off/);
    expect(content[0]?.text).toMatch(/Do not greet again/);
  });

  it("ignores non-spoken and empty turns, and returns [] when nothing remains", () => {
    expect(buildResumeHistory([])).toEqual([]);
    expect(
      buildResumeHistory([turn("tool", "get_current_problem complete"), turn("connection", "closed"), turn("candidate", "   ")]),
    ).toEqual([]);
  });

  it("caps replay at the most recent 30 turns", () => {
    const events = Array.from({ length: 35 }, (_, i) =>
      turn(i % 2 === 0 ? "assistant" : "candidate", `turn ${i}`),
    );
    const history = buildResumeHistory(events);
    expect(history.length).toBe(31);
    expect(itemAt(history, 0)).toMatchObject({ content: [{ text: "turn 5" }] });
  });

  it("drops the oldest turns past the character budget and truncates a lone oversized turn", () => {
    const big = "x".repeat(5000);
    const history = buildResumeHistory([turn("candidate", big), turn("assistant", big)]);
    expect(history.length).toBe(2);
    const first = itemAt(history, 0);
    expect(first?.["role"]).toBe("assistant");
    const lone = buildResumeHistory([turn("candidate", "y".repeat(9000))]);
    const content = (itemAt(lone, 0)?.["content"] as { text: string }[])[0];
    expect(content?.text.length).toBe(8000);
  });
});
