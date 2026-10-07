// Phase 6 Lobby readiness + gating: pure helpers. No network, no React, no
// browser. The Lobby's "Begin interview" gate must be provable without a mic.

import { describe, expect, it } from "vitest";
import {
  canBegin,
  micReadyLabel,
  sessionReadinessFromVoiceMode,
  sessionReadyLabel,
} from "../src/lobby.js";

describe("lobby readiness", () => {
  it("maps the backend voice mode to session readiness", () => {
    expect(sessionReadinessFromVoiceMode("unconfigured")).toBe("unconfigured");
    expect(sessionReadinessFromVoiceMode("api-key-local-dev")).toBe("ready");
    expect(sessionReadinessFromVoiceMode("entra-ephemeral")).toBe("ready");
    expect(sessionReadinessFromVoiceMode("test")).toBe("ready");
  });

  it("treats a missing/blank voice mode as an error (not ready)", () => {
    expect(sessionReadinessFromVoiceMode(null)).toBe("error");
    expect(sessionReadinessFromVoiceMode(undefined)).toBe("error");
    expect(sessionReadinessFromVoiceMode("   ")).toBe("error");
  });

  it("only enables Start when mic AND session are ready", () => {
    expect(canBegin("ready", "ready")).toBe(true);
    expect(canBegin("checking", "ready")).toBe(false);
    expect(canBegin("ready", "checking")).toBe(false);
    expect(canBegin("denied", "ready")).toBe(false);
    expect(canBegin("ready", "unconfigured")).toBe(false);
    expect(canBegin("ready", "error")).toBe(false);
    expect(canBegin("unsupported", "unconfigured")).toBe(false);
  });

  it("labels every readiness state", () => {
    expect(micReadyLabel("ready")).toContain("Microphone");
    expect(micReadyLabel("denied")).toContain("blocked");
    expect(micReadyLabel("unsupported")).toContain("unavailable");
    expect(micReadyLabel("checking")).toContain("Checking");
    expect(sessionReadyLabel("ready")).toContain("Session");
    expect(sessionReadyLabel("unconfigured")).toContain("Voice");
    expect(sessionReadyLabel("error")).toContain("verify");
  });
});
