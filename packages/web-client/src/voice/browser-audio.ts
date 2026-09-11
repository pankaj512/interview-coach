// @interview-coach/web-client — browser mic/playback adapters (S4).
//
// Thin WebAudio adapters over the tested `audio.ts` pipeline. Capture honors
// the frozen audio contract (PCM16 / 24 kHz / mono to Voice Live); device
// echo cancellation + noise suppression stay enabled in getUserMedia as a
// complement to the server-side processing the session requests. These
// adapters need a real microphone/speakers and are therefore NOT unit-tested;
// all conversion logic they rely on is covered in tests/audio.test.ts.

import { pcm16ToBase64, pcm16ToFloat32, prepareCaptureChunk, resampleLinear } from "./audio.js";
import type { MicCapture, PlaybackSink } from "./voice-client.js";

const CAPTURE_CHUNK_SECONDS = 0.02;

const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.target = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i += 1) this.buffer.push(channel[i]);
      if (this.target === 0) this.target = Math.floor(sampleRate * ${CAPTURE_CHUNK_SECONDS});
      while (this.buffer.length >= this.target && this.target > 0) {
        this.port.postMessage(this.buffer.slice(0, this.target));
        this.buffer = this.buffer.slice(this.target);
      }
    }
    return true;
  }
}
registerProcessor("ic-capture", CaptureProcessor);
`;

export async function createBrowserMicCapture(
  onChunk: (base64Pcm16: string) => void,
): Promise<MicCapture> {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextCtor === undefined) throw new Error("Web Audio is not supported in this browser");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const context = new AudioContextCtor();
  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  try {
    await context.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "ic-capture");
  const deviceChannels = 1;
  const deviceRate = context.sampleRate;
  let running = false;
  const capture: MicCapture = {
    onChunk: null,
    start: async () => {
      if (running) return;
      running = true;
      if (context.state === "suspended") await context.resume();
      source.connect(node);
      node.connect(context.destination);
    },
    stop: async () => {
      running = false;
      try {
        source.disconnect(node);
        node.disconnect();
      } catch {
        // already torn down
      }
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
    },
  };
  node.port.onmessage = (event: MessageEvent<number[]>) => {
    if (!running) return;
    const frames = new Float32Array(event.data);
    const pcm = prepareCaptureChunk(frames, deviceChannels, deviceRate);
    if (pcm.length === 0) return;
    onChunk(pcm16ToBase64(pcm));
  };
  return capture;
}

export function createBrowserPlayback(): PlaybackSink {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextCtor === undefined) throw new Error("Web Audio is not supported in this browser");
  const context = new AudioContextCtor();
  let cursor = 0;
  let live: AudioBufferSourceNode[] = [];
  const sink: PlaybackSink = {
    enqueue(samples: Int16Array): void {
      if (context.state === "suspended") void context.resume();
      const deviceRate = context.sampleRate;
      const float = pcm16ToFloat32(samples);
      const resampled = resampleLinear(float, 24_000, deviceRate);
      const buffer = context.createBuffer(1, resampled.length, deviceRate);
      const channel = new Float32Array(resampled.length);
      channel.set(resampled);
      buffer.copyToChannel(channel, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const now = context.currentTime;
      const startAt = Math.max(now, cursor);
      source.start(startAt);
      cursor = startAt + buffer.duration;
      live.push(source);
      source.onended = () => {
        live = live.filter((entry) => entry !== source);
      };
    },
    flush(): void {
      const playing = live;
      live = [];
      for (const source of playing) {
        try {
          source.stop();
        } catch {
          // already ended
        }
        try {
          source.disconnect();
        } catch {
          // already torn down
        }
      }
      cursor = context.currentTime;
    },
    stop(): void {
      sink.flush();
      void context.close().catch(() => undefined);
    },
  };
  return sink;
}
