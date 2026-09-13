// S6 DS model tests (ux-spec §2/§4): icon+label views, timer rule, clock.

import { describe, expect, it } from "vitest";
import {
  chipViewFor,
  formatClock,
  secondsLeftFor,
  timerStatus,
  voiceViewFor,
} from "../src/ds/model.js";

describe("chipViewFor", () => {
  it("maps connected without mic issues to Connected", () => {
    expect(chipViewFor("connected", false)).toMatchObject({ state: "connected", label: "Connected" });
  });
  it("micBlocked wins over any connection (icon + label, never color-alone)", () => {
    const view = chipViewFor("connected", true);
    expect(view.state).toBe("micBlocked");
    expect(view.icon.trim()).not.toBe("");
    expect(view.label).toBe("Mic blocked");
  });
  it("reconnecting maps to Reconnecting", () => {
    expect(chipViewFor("reconnecting", false).label).toBe("Reconnecting");
  });
});

describe("voiceViewFor", () => {
  it("assistant speaking wins over open mic", () => {
    expect(
      voiceViewFor({ assistantSpeaking: true, candidateSpeaking: false, connection: "connected", micBlocked: false })
        .phase,
    ).toBe("speaking");
  });
  it("connecting maps to connecting", () => {
    expect(
      voiceViewFor({ assistantSpeaking: false, candidateSpeaking: false, connection: "connecting", micBlocked: false })
        .phase,
    ).toBe("connecting");
  });
  it("micBlocked maps to muted", () => {
    expect(
      voiceViewFor({ assistantSpeaking: true, candidateSpeaking: true, connection: "connected", micBlocked: true })
        .phase,
    ).toBe("muted");
  });
  it("candidate speaking maps to userSpeaking (spec §12)", () => {
    expect(
      voiceViewFor({ assistantSpeaking: false, candidateSpeaking: true, connection: "connected", micBlocked: false })
        .phase,
    ).toBe("userSpeaking");
  });
  it("explicit mute wins over an open mic", () => {
    expect(
      voiceViewFor({ assistantSpeaking: false, candidateSpeaking: false, connection: "connected", micBlocked: false, muted: true })
        .phase,
    ).toBe("muted");
  });
  it("paused wins over everything", () => {
    expect(
      voiceViewFor({ assistantSpeaking: true, candidateSpeaking: true, connection: "connected", micBlocked: false, paused: true })
        .phase,
    ).toBe("paused");
  });
  it("failed connection maps to error", () => {
    expect(
      voiceViewFor({ assistantSpeaking: false, candidateSpeaking: false, connection: "failed", micBlocked: false })
        .phase,
    ).toBe("error");
  });
  it("idle open mic is listening", () => {
    expect(
      voiceViewFor({ assistantSpeaking: false, candidateSpeaking: false, connection: "connected", micBlocked: false })
        .phase,
    ).toBe("listening");
  });
});

describe("timer", () => {
  it("Low under 5 minutes remaining, Normal otherwise", () => {
    expect(timerStatus(299)).toBe("low");
    expect(timerStatus(300)).toBe("normal");
    expect(timerStatus(null)).toBe("normal");
  });
  it("secondsLeftFor returns null without a duration, clamps at zero", () => {
    expect(secondsLeftFor(undefined, 10)).toBeNull();
    expect(secondsLeftFor(30, 60)).toBe(1740);
    expect(secondsLeftFor(1, 3600)).toBe(0);
  });
  it("formatClock renders mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65)).toBe("01:05");
  });
});
