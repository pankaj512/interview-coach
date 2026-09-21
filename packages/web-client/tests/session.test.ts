// Session wire-format tests (S4): CLI-compatible session.update + browser
// credential transport. No network.
import { describe, expect, it } from "vitest";
import type { VoiceSessionPayload } from "../src/api/types.js";
import {
  buildAuthenticatedVoiceUrl,
  buildFunctionCallOutput,
  buildSessionUpdate,
  REALTIME_TOOL_DEFINITIONS,
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
  it("advertises the four canonical Phase 8 tools", () => {
    expect(REALTIME_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "get_current_interview",
      "get_current_problem",
      "submit_interview_data",
      "end_interview",
    ]);
    for (const tool of REALTIME_TOOL_DEFINITIONS) {
      expect(tool.type).toBe("function");
      expect(tool.parameters.additionalProperties).toBe(false);
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
    expect((update.session["tools"] as unknown[]).length).toBe(4);
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
