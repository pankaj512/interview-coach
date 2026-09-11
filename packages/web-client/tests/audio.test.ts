// Audio conversion tests (S4): frozen PCM16 / 24 kHz / mono contract.
import { describe, expect, it } from "vitest";
import {
  base64ToPcm16,
  downmixToMono,
  float32ToPcm16,
  pcm16ToBase64,
  pcm16ToFloat32,
  prepareCaptureChunk,
  resampleLinear,
  TARGET_CHANNELS,
  TARGET_SAMPLE_RATE_HZ,
} from "../src/voice/audio.js";

describe("audio", () => {
  it("targets 24 kHz mono", () => {
    expect(TARGET_SAMPLE_RATE_HZ).toBe(24_000);
    expect(TARGET_CHANNELS).toBe(1);
  });

  it("clamps float samples to int16 range", () => {
    const pcm = float32ToPcm16(new Float32Array([1, -1, 1.5, -2, 0, 0.5]));
    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32768);
    expect(pcm[2]).toBe(32767);
    expect(pcm[3]).toBe(-32768);
    expect(pcm[4]).toBe(0);
    expect(pcm[5]).toBe(16384);
  });

  it("round-trips pcm16 through float32 within one LSB", () => {
    const original = new Int16Array([0, 1, -1, 32767, -32768, 12345]);
    const back = float32ToPcm16(pcm16ToFloat32(original));
    for (let i = 0; i < original.length; i += 1) {
      expect(Math.abs((back[i] as number) - (original[i] as number))).toBeLessThanOrEqual(1);
    }
  });

  it("downmixes interleaved stereo to mono by averaging", () => {
    const stereo = new Float32Array([1, -1, 0.5, 0.5]);
    expect(Array.from(downmixToMono(stereo, 2))).toEqual([0, 0.5]);
    const mono = new Float32Array([0.25, -0.25]);
    expect(Array.from(downmixToMono(mono, 1))).toEqual([0.25, -0.25]);
  });

  it("resamples 48 kHz to 24 kHz at half length and preserves DC", () => {
    const input = new Float32Array(480).fill(0.5);
    const out = resampleLinear(input, 48_000, 24_000);
    expect(out.length).toBe(240);
    for (const sample of out) expect(sample).toBeCloseTo(0.5, 5);
  });

  it("resample is identity for equal rates and rejects bad rates", () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const identity = Array.from(resampleLinear(input, 24_000, 24_000));
    expect(identity.length).toBe(3);
    identity.forEach((sample, i) => expect(sample).toBeCloseTo([0.1, 0.2, 0.3][i] as number, 6));
    expect(resampleLinear(new Float32Array(0), 48_000, 24_000).length).toBe(0);
    expect(() => resampleLinear(input, 0, 24_000)).toThrow();
  });

  it("prepares a 48 kHz stereo device chunk as 24 kHz mono PCM16", () => {
    // 20ms @48kHz stereo = 960 frames * 2 channels.
    const frames = new Float32Array(960 * 2).fill(0.25);
    const pcm = prepareCaptureChunk(frames, 2, 48_000);
    expect(pcm.length).toBe(480);
    for (const sample of pcm) expect(sample).toBeCloseTo(8192, -2);
  });

  it("round-trips PCM16 through base64", () => {
    const original = new Int16Array([0, 32767, -32768, 1000, -1000]);
    expect(Array.from(base64ToPcm16(pcm16ToBase64(original)))).toEqual(Array.from(original));
  });

  it("rejects malformed base64 deltas", () => {
    expect(() => base64ToPcm16("!!!")).toThrow();
    expect(() => base64ToPcm16("abc")).toThrow();
  });
});
