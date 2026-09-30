// Interviewer-voice preference tests: closed-set validation only. No DOM,
// no network - localStorage is stubbed through the global.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VOICE, loadVoicePreference, REALTIME_VOICES, saveVoicePreference } from "../src/voice/voice-prefs.js";

function stubStorage(initial: Record<string, string> = {}): Record<string, string> {
  const data: Record<string, string> = { ...initial };
  const getItem = vi.fn((key: string) => (key in data ? (data[key] as string) : null));
  const setItem = vi.fn((key: string, value: string) => {
    data[key] = value;
  });
  const removeItem = vi.fn((key: string) => {
    delete data[key];
  });
  vi.stubGlobal("localStorage", { getItem, setItem, removeItem });
  return data;
}

describe("voice preference", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the closed Azure realtime voice set", () => {
    expect(REALTIME_VOICES).toContain("alloy");
    expect(REALTIME_VOICES).toHaveLength(10);
  });

  it("defaults to the service voice the backend mints without a preference", () => {
    expect(DEFAULT_VOICE).toBe("alloy");
    expect(REALTIME_VOICES).toContain(DEFAULT_VOICE);
  });

  it("returns null when nothing is stored", () => {
    stubStorage();
    expect(loadVoicePreference()).toBeNull();
  });

  it("returns a stored voice from the closed set", () => {
    stubStorage({ "ic.voice": "sage" });
    expect(loadVoicePreference()).toBe("sage");
  });

  it("rejects unknown or empty stored values", () => {
    stubStorage({ "ic.voice": "en-US-Andrew" });
    expect(loadVoicePreference()).toBeNull();
    stubStorage({ "ic.voice": "  " });
    expect(loadVoicePreference()).toBeNull();
  });

  it("round-trips a valid voice and clears on empty", () => {
    const data = stubStorage();
    saveVoicePreference("coral");
    expect(data["ic.voice"]).toBe("coral");
    expect(loadVoicePreference()).toBe("coral");
    saveVoicePreference("");
    expect("ic.voice" in data).toBe(false);
  });

  it("ignores saves outside the closed set", () => {
    const data = stubStorage();
    saveVoicePreference("en-US-Andrew");
    expect("ic.voice" in data).toBe(false);
  });
});
