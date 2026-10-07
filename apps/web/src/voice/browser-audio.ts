// @interview-coach/web - browser mic/playback adapters (S4).
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
  interface CaptureChain {
    readonly context: AudioContext;
    readonly stream: MediaStream;
    readonly source: MediaStreamAudioSourceNode;
    readonly node: AudioWorkletNode;
  }
  // One live chain per start/stop cycle: stop() releases the tracks and
  // closes the context, so a later start() must build a fresh chain.
  // Without this, restart reconnects a dead source to a closed context and
  // streams silence while the session reports connected.
  const buildChain = async (): Promise<CaptureChain> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    const context = new AudioContextCtor();
    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await context.audioWorklet.addModule(blobUrl);
    } catch (e) {
      stream.getTracks().forEach((track) => track.stop());
      await context.close().catch(() => undefined);
      throw e;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "ic-capture");
    const deviceChannels = 1;
    const deviceRate = context.sampleRate;
    node.port.onmessage = (event: MessageEvent<number[]>) => {
      if (!running) return;
      const frames = new Float32Array(event.data);
      const pcm = prepareCaptureChunk(frames, deviceChannels, deviceRate);
      if (pcm.length === 0) return;
      onChunk(pcm16ToBase64(pcm));
    };
    return { context, stream, source, node };
  };
  let running = false;
  let chain: CaptureChain | null = await buildChain();
  const tearDown = async (): Promise<void> => {
    const retired = chain;
    chain = null;
    if (retired === null) return;
    try {
      retired.source.disconnect(retired.node);
      retired.node.disconnect();
    } catch {
      // already torn down
    }
    retired.stream.getTracks().forEach((track) => track.stop());
    await retired.context.close().catch(() => undefined);
  };
  const capture: MicCapture = {
    onChunk: null,
    start: async () => {
      if (running) return;
      running = true;
      try {
        if (chain === null) chain = await buildChain();
      } catch (e) {
        running = false;
        throw e;
      }
      const live = chain;
      if (live.context.state === "suspended") await live.context.resume();
      live.source.connect(live.node);
      live.node.connect(live.context.destination);
    },
    stop: async () => {
      running = false;
      await tearDown();
    },
  };
  return capture;
}

export function createBrowserPlayback(): PlaybackSink {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextCtor === undefined) throw new Error("Web Audio is not supported in this browser");
  // Recreated after every stop(): enqueueing on a closed context throws, and
  // the voice client swallows that throw as a malformed chunk, so a resumed
  // session would stay silent while reporting connected.
  let context: AudioContext | null = new AudioContextCtor();
  let cursor = 0;
  let live: AudioBufferSourceNode[] = [];
  const ensureContext = (): AudioContext => {
    if (context === null || context.state === "closed") {
      context = new AudioContextCtor();
      cursor = 0;
    }
    return context;
  };
  const sink: PlaybackSink = {
    enqueue(samples: Int16Array): void {
      const active = ensureContext();
      if (active.state === "suspended") void active.resume();
      const deviceRate = active.sampleRate;
      const float = pcm16ToFloat32(samples);
      const resampled = resampleLinear(float, 24_000, deviceRate);
      const buffer = active.createBuffer(1, resampled.length, deviceRate);
      const channel = new Float32Array(resampled.length);
      channel.set(resampled);
      buffer.copyToChannel(channel, 0);
      const source = active.createBufferSource();
      source.buffer = buffer;
      source.connect(active.destination);
      const now = active.currentTime;
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
      cursor = context !== null && context.state !== "closed" ? context.currentTime : 0;
    },
    stop(): void {
      sink.flush();
      const retired = context;
      context = null;
      if (retired !== null) void retired.close().catch(() => undefined);
    },
  };
  return sink;
}
