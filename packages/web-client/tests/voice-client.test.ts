// VoiceInterviewClient tests (S4): realtime lifecycle with fakes — fake
// WebSocket, mic, playback, and tool executor. No mic, speakers, or network.
import { describe, expect, it } from "vitest";
import { BackendClient, type FetchFn } from "../src/api/backend-client.js";
import type { ToolExecOutcome, ToolName, VoiceSessionPayload } from "../src/api/types.js";
import { pcm16ToBase64 } from "../src/voice/audio.js";
import { buildResumeHistory } from "../src/voice/session.js";
import {
  addPendingCallId,
  createMemoryStorage,
  loadPendingCallIds,
  type KeyValueStorage,
} from "../src/voice/pending-store.js";
import {
  VoiceInterviewClient,
  type MicCapture,
  type PlaybackSink,
  type VoiceConnectionState,
  type VoiceWebSocket,
} from "../src/voice/voice-client.js";
import type { ToolExecutor } from "../src/voice/tool-forwarder.js";

class FakeSocket implements VoiceWebSocket {
  static instances: FakeSocket[] = [];
  readonly sent: string[] = [];
  readyState = 1;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  static reset(): void {
    FakeSocket.instances = [];
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.({});
  }

  serverMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  sentTypes(): string[] {
    return this.sent.map((raw) => (JSON.parse(raw) as { type: string }).type);
  }
}

function fakeMic(): MicCapture & { started: boolean; stopped: boolean } {
  return {
    started: false,
    stopped: false,
    onChunk: null,
    start: async function (this: { started: boolean }) {
      this.started = true;
    },
    stop: async function (this: { stopped: boolean }) {
      this.stopped = true;
    },
  } as unknown as MicCapture & { started: boolean; stopped: boolean };
}

function fakePlayback(): PlaybackSink & { enqueued: Int16Array[]; flushes: number; stopped: boolean } {
  const sink = {
    enqueued: [] as Int16Array[],
    flushes: 0,
    stopped: false,
    enqueue(samples: Int16Array): void {
      sink.enqueued.push(samples);
    },
    flush(): void {
      sink.flushes += 1;
    },
    stop(): void {
      sink.stopped = true;
    },
  };
  return sink;
}

function mint(): VoiceSessionPayload {
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
  };
}

function okResult(callId: string, tool: ToolName, result: unknown = { ok: true }): ToolExecOutcome {
  return { ok: true, callId, tool, result, replayed: false };
}

interface Harness {
  client: VoiceInterviewClient;
  socket: () => FakeSocket;
  states: VoiceConnectionState[];
  metrics: Array<{ event: string; fields?: Record<string, unknown> }>;
  errors: Error[];
  assistant: boolean[];
  candidate: boolean[];
  mic: MicCapture & { started: boolean; stopped: boolean };
  playback: PlaybackSink & { enqueued: Int16Array[]; flushes: number; stopped: boolean };
  execCalls: Array<{ callId: string; tool: ToolName }>;
}

function harness(
  execImpl?: (callId: string, tool: ToolName) => ToolExecOutcome,
  storage?: KeyValueStorage,
): Harness {
  FakeSocket.reset();
  const states: VoiceConnectionState[] = [];
  const metrics: Harness["metrics"] = [];
  const errors: Error[] = [];
  const assistant: boolean[] = [];
  const candidate: boolean[] = [];
  const mic = fakeMic();
  const playback = fakePlayback();
  const execCalls: Harness["execCalls"] = [];
  const executor: ToolExecutor = async (callId, tool) => {
    execCalls.push({ callId, tool });
    return execImpl?.(callId, tool) ?? okResult(callId, tool);
  };
  const client = new VoiceInterviewClient(
    {
      wsFactory: (url) => new FakeSocket(url),
      mic,
      playback,
      toolExecutor: executor,
      storage: storage ?? createMemoryStorage(),
      sessionAckTimeoutMs: 5,
      sleep: async () => undefined,
      now: () => 1000,
    },
    {
      onConnectionState: (state) => states.push(state),
      onAssistantSpeaking: (speaking) => assistant.push(speaking),
      onCandidateSpeaking: (speaking) => candidate.push(speaking),
      onMetric: (event, fields) => metrics.push(fields === undefined ? { event } : { event, fields }),
      onError: (error) => errors.push(error),
    },
  );
  return {
    client,
    socket: () => FakeSocket.instances[FakeSocket.instances.length - 1] as FakeSocket,
    states,
    metrics,
    errors,
    assistant,
    candidate,
    mic,
    playback,
    execCalls,
  };
}

async function tick(ms = 10): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("VoiceInterviewClient", () => {
  it("connects, sends session.update with the frozen config, then greets", async () => {
    const h = harness();
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    const socket = h.socket();
    expect(new URL(socket.url).searchParams.get("api-key")).toBe("dev-only-key");
    const update = JSON.parse(socket.sent[0] as string) as { type: string; session: Record<string, unknown> };
    expect(update.type).toBe("session.update");
    expect(update.session["voice"]).toBe("alloy");
    expect(update.session["turn_detection"]).toMatchObject({ type: "server_vad", threshold: 0.35 });
    expect((update.session["tools"] as unknown[]).length).toBe(5);
    expect(socket.sentTypes()).toContain("response.create");
    expect(h.client.state).toBe("connected");
    expect(h.states).toContain("connected");
    expect(h.mic.started).toBe(true);
  });

  it("replays resume history before the greeting, and greets plainly without it", async () => {
    const h = harness();
    const history = buildResumeHistory([
      { kind: "assistant", detail: "How would you approach this?" },
      { kind: "candidate", detail: "With a hash map." },
    ]);
    const pending = h.client.connect("int_1", mint(), { resumeHistory: history });
    h.socket().open();
    await pending;
    const types = h.socket().sentTypes();
    expect(types[0]).toBe("session.update");
    expect(types.filter((type) => type === "conversation.item.create").length).toBe(3);
    expect(types[types.length - 1]).toBe("response.create");

    const plain = harness();
    const pendingPlain = plain.client.connect("int_1", mint());
    plain.socket().open();
    await pendingPlain;
    expect(plain.socket().sentTypes()).not.toContain("conversation.item.create");
  });

  it("drops mic audio once the socket leaves OPEN (no CLOSING/CLOSED send spam)", async () => {    const h = harness();
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    const socket = h.socket();
    const sentBefore = socket.sent.length;
    socket.readyState = 3;
    h.client.sendMicAudio("AAAA");
    expect(socket.sent.length).toBe(sentBefore);
  });

  it("routes audio deltas to playback and tracks speaker state", async () => {
    const h = harness();
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    h.socket().serverMessage({ type: "response.created", response: { id: "resp_1" } });
    expect(h.assistant).toContain(true);
    h.socket().serverMessage({ type: "response.audio.delta", delta: pcm16ToBase64(new Int16Array([100, -100])) });
    expect(h.playback.enqueued.length).toBe(1);
    expect(h.metrics.map((m) => m.event)).toContain("first_audio_delta");
    h.socket().serverMessage({ type: "response.done", response: { output: [] } });
    expect(h.assistant[h.assistant.length - 1]).toBe(false);
  });

  it("cancels once per turn on barge-in and flushes playback", async () => {
    const h = harness();
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    h.socket().serverMessage({ type: "response.created", response: { id: "resp_1" } });
    h.socket().serverMessage({ type: "input_audio_buffer.speech_started" });
    h.socket().serverMessage({ type: "input_audio_buffer.speech_started" });
    const cancels = h.socket().sentTypes().filter((type) => type === "response.cancel");
    expect(cancels.length).toBe(1);
    expect(h.playback.flushes).toBe(1);
    expect(h.metrics.map((m) => m.event)).toContain("playback_flush");
    expect(h.candidate).toContain(true);
    h.socket().serverMessage({ type: "input_audio_buffer.speech_stopped" });
    expect(h.candidate[h.candidate.length - 1]).toBe(false);
  });

  it("executes each call_id once across duplicate protocol events", async () => {
    const h = harness();
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    const item = { type: "function_call", id: "item_1", call_id: "call_7", name: "get_interview_state", arguments: "{}" };
    h.socket().serverMessage({ type: "conversation.item.created", item });
    h.socket().serverMessage({ type: "response.function_call_arguments.done", call_id: "call_7", name: "get_interview_state", arguments: "{}" });
    h.socket().serverMessage({ type: "response.output_item.done", item });
    await tick();
    expect(h.execCalls.filter((call) => call.callId === "call_7")).toHaveLength(1);
    const outputs = h.socket().sent.filter((raw) => (JSON.parse(raw) as { type: string }).type === "conversation.item.create");
    expect(outputs).toHaveLength(1);
    const output = JSON.parse(outputs[0] as string) as { item: { call_id: string; output: string } };
    expect(output.item.call_id).toBe("call_7");
    expect(JSON.parse(output.item.output)).toMatchObject({ call_id: "call_7" });
    expect(h.metrics.map((m) => m.event)).toContain("output_submitted");
  });

  it("forwards permanent tool failures as error outputs without retrying", async () => {
    const h = harness((callId, tool) => ({
      ok: false,
      status: 409,
      code: "ILLEGAL_TRANSITION",
      message: "cannot end",
      retryable: false,
      callId,
      tool,
      replayed: false,
    }));
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    h.socket().serverMessage({
      type: "response.function_call_arguments.done",
      call_id: "call_9",
      name: "end_interview",
      arguments: "{}",
    });
    await tick();
    expect(h.execCalls).toHaveLength(1);
    const outputs = h.socket().sent.filter((raw) => (JSON.parse(raw) as { type: string }).type === "conversation.item.create");
    expect(outputs).toHaveLength(1);
    expect(JSON.parse((JSON.parse(outputs[0] as string) as { item: { output: string } }).item.output)).toMatchObject({
      error: { code: "ILLEGAL_TRANSITION" },
    });
  });

  it("ignores unknown tool names", async () => {
    const h = harness();
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    h.socket().serverMessage({
      type: "response.function_call_arguments.done",
      call_id: "call_x",
      name: "query_database",
      arguments: "{}",
    });
    await tick();
    expect(h.execCalls).toHaveLength(0);
  });

  it("rehydrates pending call_ids via tool-results and serves them without re-execution", async () => {
    const storage = createMemoryStorage();
    const h = harness(undefined, storage);
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    // Simulate a tool call whose output never got acked (no response.created).
    h.socket().serverMessage({
      type: "response.function_call_arguments.done",
      call_id: "call_r",
      name: "get_interview_state",
      arguments: "{}",
    });
    await tick();
    expect(h.execCalls).toHaveLength(1);

    // Reload recovery: the pending id resolves via GET tool-results.
    const seen: string[] = [];
    const backend = new BackendClient(
      "http://localhost:3000",
      (async (input: string) => {
        seen.push(input);
        return {
          status: 200,
          json: async () => ({
            ok: true,
            callId: "call_r",
            tool: "get_interview_state",
            result: { status: "in_progress" },
            replayed: true,
          }),
        };
      }) as FetchFn,
    );
    const recovered = await h.client.recoverPendingOutputs(backend, "int_1", storage);
    expect([...recovered.keys()]).toEqual(["call_r"]);
    expect(seen[0]).toContain("/tool-results/call_r");

    // Fresh client after a reload (new ledger, same storage): the recovered
    // result is served when the session requests the same call_id, with no
    // re-execution against the backend.
    const h2 = harness(undefined, storage);
    const pending2 = h2.client.connect("int_1", mint());
    h2.socket().open();
    await pending2;
    const recovered2 = await h2.client.recoverPendingOutputs(backend, "int_1", storage);
    expect([...recovered2.keys()]).toEqual(["call_r"]);
    h2.socket().serverMessage({
      type: "response.function_call_arguments.done",
      call_id: "call_r",
      name: "get_interview_state",
      arguments: "{}",
    });
    await tick();
    expect(h2.execCalls).toHaveLength(0);
    const outputs2 = h2
      .socket()
      .sent.filter((raw) => (JSON.parse(raw) as { type: string }).type === "conversation.item.create");
    expect(outputs2).toHaveLength(1);
    expect(JSON.parse((JSON.parse(outputs2[0] as string) as { item: { output: string } }).item.output)).toMatchObject({
      result: { status: "in_progress" },
    });
  });

  it("drops stale pending ids unknown to the backend", async () => {
    const h = harness();
    const storage = createMemoryStorage();
    addPendingCallId(storage, "call_stale");
    const backend = new BackendClient(
      "http://localhost:3000",
      (async () => ({
        status: 404,
        json: async () => ({ ok: false, error: { code: "NOT_FOUND", message: "x", retryable: false } }),
      })) as FetchFn,
    );
    const recovered = await h.client.recoverPendingOutputs(backend, "int_1", storage);
    expect(recovered.size).toBe(0);
    expect(loadPendingCallIds(storage)).toEqual([]);
  });

  it("disconnect tears down mic/playback and closes the socket", async () => {
    const h = harness();
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    await h.client.disconnect();
    expect(h.client.state).toBe("closed");
    expect(h.mic.stopped).toBe(true);
    expect(h.playback.stopped).toBe(true);
    expect(h.socket().closed).toBe(true);
  });

  it("drops mic audio unless connected", async () => {
    const h = harness();
    h.client.sendMicAudio(pcm16ToBase64(new Int16Array([1, 2, 3])));
    expect(FakeSocket.instances).toHaveLength(0);
    const pending = h.client.connect("int_1", mint());
    h.socket().open();
    await pending;
    h.client.sendMicAudio(pcm16ToBase64(new Int16Array([1, 2, 3])));
    expect(h.socket().sentTypes()).toContain("input_audio_buffer.append");
  });
});
