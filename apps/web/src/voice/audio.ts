// @interview-coach/web - PCM audio helpers (frozen section 3).
//
// Audio: PCM16 / 24 kHz / mono both directions. The browser captures at the
// device rate (often 48 kHz stereo) and must downmix + resample before
// sending; playback does the reverse. Env-agnostic (no AudioContext here) so
// vitest covers conversion exactly.

export const TARGET_SAMPLE_RATE_HZ = 24_000;
export const TARGET_CHANNELS = 1;

export function clampFloatSample(value: number): number {
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

export function float32ToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = clampFloatSample(samples[i] as number);
    out[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }
  return out;
}

export function pcm16ToFloat32(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = (samples[i] as number) / 32768;
  }
  return out;
}

// Average stereo (or N-channel) frames down to mono. Input is interleaved.
export function downmixToMono(interleaved: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return interleaved.slice();
  const frames = Math.floor(interleaved.length / channels);
  const out = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch += 1) {
      sum += interleaved[frame * channels + ch] as number;
    }
    out[frame] = sum / channels;
  }
  return out;
}

// Linear resample between arbitrary rates (device rate -> 24 kHz capture,
// 24 kHz -> device rate playback). Identity when rates match.
export function resampleLinear(input: Float32Array, fromRateHz: number, toRateHz: number): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  if (fromRateHz === toRateHz) return input.slice();
  if (fromRateHz <= 0 || toRateHz <= 0) throw new Error("Sample rates must be positive");
  const durationSeconds = input.length / fromRateHz;
  const outputLength = Math.max(1, Math.round(durationSeconds * toRateHz));
  const out = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const position = (i / toRateHz) * fromRateHz;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, input.length - 1);
    const fraction = position - lower;
    const a = input[lower] as number;
    const b = input[upper] as number;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}

// Capture pipeline: device Float32 frames -> 24 kHz mono PCM16 chunk.
export function prepareCaptureChunk(
  frames: Float32Array,
  deviceChannels: number,
  deviceSampleRateHz: number,
): Int16Array {
  const mono = downmixToMono(frames, deviceChannels);
  const resampled = resampleLinear(mono, deviceSampleRateHz, TARGET_SAMPLE_RATE_HZ);
  return float32ToPcm16(resampled);
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Env-agnostic base64 (Voice Live audio deltas are base64 PCM16). Avoids
// btoa/atob so the same code runs in browsers and in node/vitest.
export function pcm16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : "=";
  }
  return out;
}

export function base64ToPcm16(base64: string): Int16Array {
  const clean = base64.replace(/\s/g, "");
  if (clean.length % 4 !== 0) throw new Error("Invalid base64 audio delta");
  const table = new Map<string, number>();
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table.set(BASE64_ALPHABET[i] as string, i);
  }
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const byteLength = (clean.length / 4) * 3 - padding;
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const sextets = [0, 0, 0, 0].map((_, k) => {
      const ch = clean[i + k] as string;
      if (ch === "=") return 0;
      const value = table.get(ch);
      if (value === undefined) throw new Error("Invalid base64 audio delta");
      return value;
    });
    const triple =
      ((sextets[0] as number) << 18) | ((sextets[1] as number) << 12) | ((sextets[2] as number) << 6) | (sextets[3] as number);
    if (offset < byteLength) bytes[offset++] = (triple >> 16) & 255;
    if (offset < byteLength) bytes[offset++] = (triple >> 8) & 255;
    if (offset < byteLength) bytes[offset++] = triple & 255;
  }
  if (bytes.byteLength % 2 !== 0) throw new Error("PCM16 delta has odd byte length");
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}
