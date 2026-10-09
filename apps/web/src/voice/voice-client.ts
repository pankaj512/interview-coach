// @interview-coach/web - realtime Voice Live client.
//
// Owns: the direct browser to Voice Live media plane (PCM16/24kHz/mono),
// function-call dedup, barge-in cancel, injected collaborators for tests.
// Surprising: one model call can surface through several protocol events;
// execution still runs exactly once.
//
// History: S4; see docs/SESSION_HANDOFF.md.

import { BackendApiError, BackendClient } from "../api/backend-client.js";
import type { ToolArgs, ToolName, VoiceSessionPayload } from "../api/types.js";
import { base64ToPcm16 } from "./audio.js";
import {
  addPendingCallId,
  loadPendingCallIds,
  removePendingCallId,
  type KeyValueStorage,
} from "./pending-store.js";
import {
  buildAuthenticatedVoiceUrl,
  buildFunctionCallOutput,
  buildSessionUpdate,
} from "./session.js";
import { forwardToolCall, ToolOutputLedger, type ToolExecutor } from "./tool-forwarder.js";
import { loadVoicePreference } from "./voice-prefs.js";

export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "failed";

// Numeric WebSocket.OPEN without touching the DOM global (keeps the fakes in
// vitest free of browser globals).
const WEB_SOCKET_OPEN = 1;

export interface VoiceServerEvent {
  readonly type: string;
  readonly delta?: string;
  readonly call_id?: string;
  readonly name?: string;
  readonly arguments?: string;
  readonly item?: unknown;
  readonly error?: unknown;
  readonly response_id?: string;
  readonly responseId?: string;
  readonly item_id?: string;
  readonly response?: unknown;
  readonly transcript?: unknown;
  readonly [key: string]: unknown;
}

export interface VoiceClientEvents {
  readonly onConnectionState?: (state: VoiceConnectionState) => void;
  readonly onAssistantSpeaking?: (speaking: boolean) => void;
  readonly onCandidateSpeaking?: (speaking: boolean) => void;
  readonly onToolStart?: (callId: string, tool: ToolName) => void;
  readonly onToolComplete?: (callId: string, tool: ToolName, elapsedMs: number, replayed: boolean) => void;
  readonly onTranscript?: (text: string) => void;
  readonly onAssistantTranscript?: (text: string) => void;
  readonly onError?: (error: Error) => void;
  // Lifecycle/timing metric (frozen observability). Never audio content.
  readonly onMetric?: (event: string, fields?: Record<string, unknown>) => void;
}

// Minimal WebSocket surface (browser WebSocket satisfies this).
export interface VoiceWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
}

export type WebSocketFactory = (url: string) => VoiceWebSocket;

// Outgoing PCM: base64 PCM16 @24kHz mono (see audio.ts prepareCaptureChunk).
export interface MicCapture {
  start(): Promise<void>;
  stop(): Promise<void>;
  onChunk: ((base64Pcm16: string) => void) | null;
}

export interface PlaybackSink {
  enqueue(samples: Int16Array): void;
  flush(): void;
  stop(): void;
}

export interface VoiceClientDeps {
  readonly wsFactory: WebSocketFactory;
  readonly mic: MicCapture;
  readonly playback: PlaybackSink;
  readonly toolExecutor: ToolExecutor;
  readonly storage?: KeyValueStorage;
  readonly connectTimeoutMs?: number;
  readonly sessionAckTimeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

interface PendingCall {
  readonly callId: string;
  readonly name: ToolName;
  readonly previousItemId?: string;
  readonly args?: ToolArgs;
}

const VALID_TOOL_NAMES: readonly string[] = [
  "get_current_interview",
  "get_current_problem",
  "get_candidate_code",
  "get_last_submission",
  "submit_interview_data",
  "end_interview",
];

// Model-supplied function arguments arrive as a JSON string on the protocol
// events. Parse defensively: anything non-object (or unparseable) means "no
// args" - the backend applies defaults (hint tier, answer kind). Never throw.
export function parseToolArgs(raw: unknown): ToolArgs | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "{}") return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as ToolArgs;
  } catch {
    return undefined;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class VoiceInterviewClient {
  private readonly deps: VoiceClientDeps;
  private readonly events: VoiceClientEvents;
  private readonly ledger = new ToolOutputLedger();
  private ws: VoiceWebSocket | null = null;
  private interviewId: string | null = null;
  private session: VoiceSessionPayload | null = null;
  private connectionState: VoiceConnectionState = "idle";
  private assistantSpeaking = false;
  private hasLoggedAudioStart = false;
  private bargeInArmedForTurn = false;
  private activeResponseId: string | null = null;
  private pendingCall: PendingCall | null = null;
  private handledCallIds = new Set<string>();
  // Outputs recovered across a reload via GET tool-results (frozen section 5).
  // Served only if the new session requests the same call_id - the client
  // never invents outputs for calls the model did not make.
  private recoveredOutputs = new Map<string, string>();
  private lastServerEventAt = 0;
  private connectAttempt = 0;
  private disposed = false;

  constructor(deps: VoiceClientDeps, events: VoiceClientEvents = {}) {
    this.deps = deps;
    this.events = events;
  }

  get state(): VoiceConnectionState {
    return this.connectionState;
  }

  get pendingOutputCount(): number {
    return this.ledger.pendingCount;
  }

  get lastEventAt(): number {
    return this.lastServerEventAt;
  }

  get currentInterviewId(): string | null {
    return this.interviewId;
  }

  async connect(
    interviewId: string,
    session: VoiceSessionPayload,
    options?: { resumeHistory?: readonly Record<string, unknown>[] },
  ): Promise<void> {
    if (this.connectionState === "connected" || this.connectionState === "connecting") {
      throw new Error("Voice client is already connected or connecting");
    }
    this.disposed = false;
    this.interviewId = interviewId;
    this.session = session;
    this.connectAttempt += 1;
    const firstAttempt = this.connectAttempt === 1;
    this.setState(firstAttempt ? "connecting" : "reconnecting");

    const url = buildAuthenticatedVoiceUrl(session);
    const ws = this.deps.wsFactory(url);
    this.ws = ws;
    const connectTimeoutMs = this.deps.connectTimeoutMs ?? 15_000;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Voice Live connect timeout")), connectTimeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = (event) => {
        clearTimeout(timer);
        reject(event instanceof Error ? event : new Error("Voice Live connection failed"));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        reject(new Error("Voice Live closed before open"));
      };
    }).catch((error) => {
      this.ws = null;
      this.setState("failed");
      this.emitError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    });

    if (this.disposed) {
      try {
        ws.close();
      } catch {
        // ignore
      }
      return;
    }

    ws.onmessage = (event) => {
      this.handleRawMessage(event.data);
    };
    ws.onerror = () => {
      this.metric("voice.error", { interviewId });
    };
    ws.onclose = (event) => {
      this.handleClose(event.code, event.reason);
    };

    ws.send(JSON.stringify(buildSessionUpdate(session, loadVoicePreference() ?? undefined)));
    this.metric("voice.session_update_sent", { interviewId });

    // Wait for session.updated like the CLI (3s), then proceed regardless, since
    // the greeting must not hang a healthy session on a dropped ack.
    const acked = await this.waitForSessionAck(ws);
    this.metric("voice.session_ack", { interviewId, acked });

    // Flush outputs queued while disconnected (bounded 20, skip acked).
    this.flushPendingOutputs();

    await this.deps.mic.start();
    this.setState("connected");
    this.metric("voice.connected", { interviewId });

    // Resume continuity: replay the pre-pause turns before asking the model
    // to speak so it continues the thread. Without history this stays the
    // fresh-join greeting (CLI parity).
    for (const item of options?.resumeHistory ?? []) this.sendJson(item);

    // Interviewer speaks first (CLI parity).
    this.sendJson({ type: "response.create" });
    this.metric("voice.initial_greeting_requested", { interviewId });
  }

  // Reconnect with the same mint when it is still valid; queued unacked
  // outputs flush after session ack. Returns false when there is nothing to
  // reconnect (no prior interview/session).
  async reconnect(resumeHistory?: readonly Record<string, unknown>[]): Promise<boolean> {
    const interviewId = this.interviewId;
    const session = this.session;
    if (interviewId === null || session === null) return false;
    this.closeSocket();
    this.setState("reconnecting");
    await this.connect(interviewId, session, resumeHistory === undefined ? undefined : { resumeHistory });
    return true;
  }

  // Reload recovery (frozen section 5): rehydrate pending `call_id`s from
  // sessionStorage via GET tool-results. Found results are cached and served
  // when (and only when) the new session requests the same call_id - the
  // client never invents outputs for calls the model did not make. Unknown
  // ids (never executed) are dropped so a stale id can never shadow a fresh
  // call.
  async recoverPendingOutputs(
    backend: BackendClient,
    interviewId: string,
    storage: KeyValueStorage,
  ): Promise<Map<string, string>> {
    const recovered = new Map<string, string>();
    const pending = loadPendingCallIds(storage);
    for (const callId of pending) {
      let outcome;
      try {
        outcome = await backend.toolResult(interviewId, callId);
      } catch {
        continue;
      }
      if (outcome === null) {
        removePendingCallId(storage, callId);
        continue;
      }
      const output = outcome.ok
        ? JSON.stringify({ call_id: callId, result: outcome.result })
        : JSON.stringify({ call_id: callId, error: { code: outcome.code, message: outcome.message } });
      recovered.set(callId, output);
      this.recoveredOutputs.set(callId, output);
      this.handledCallIds.add(callId);
    }
    return recovered;
  }

  async disconnect(reason = "hangup"): Promise<void> {
    this.disposed = true;
    try {
      await this.deps.mic.stop();
    } catch {
      // ignore
    }
    this.deps.playback.stop();
    this.persistPending();
    this.closeSocket();
    this.setAssistantSpeaking(false);
    this.events.onCandidateSpeaking?.(false);
    this.setState("closed");
    this.metric("voice.disconnected", { reason });
  }

  // Outgoing mic PCM (base64 PCM16 @24kHz mono). Dropped unless connected.
  sendMicAudio(base64Pcm16: string): void {
    if (base64Pcm16 === "" || this.ws === null || this.connectionState !== "connected") return;
    this.sendJson({ type: "input_audio_buffer.append", audio: base64Pcm16 });
  }

  // Text fallback (spec §16): submit a typed user turn and ask the
  // interviewer to respond. Returns false when the session is not connected.
  sendTextMessage(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed === "" || this.ws === null || this.connectionState !== "connected") return false;
    this.sendJson({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: trimmed }] },
    });
    this.sendJson({ type: "response.create" });
    this.metric("text_turn_sent", { interviewId: this.interviewId ?? "" });
    return true;
  }

  // Fix B push: surface a Submit verdict summary to the interviewer as a
  // framed turn, not candidate-typed text. Best-effort: returns false when
  // the session is not connected and the caller moves on.
  notifySubmission(summary: string): boolean {
    const trimmed = summary.trim();
    if (trimmed === "" || this.ws === null || this.connectionState !== "connected") return false;
    this.sendJson({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: `[Submit result] ${trimmed}` }] },
    });
    this.sendJson({ type: "response.create" });
    this.metric("submit_push_sent", { interviewId: this.interviewId ?? "" });
    return true;
  }

  handleRawMessage(data: unknown): void {
    let event: VoiceServerEvent;
    try {
      event = JSON.parse(String(data)) as VoiceServerEvent;
    } catch {
      return;
    }
    if (typeof event.type !== "string") return;
    this.lastServerEventAt = this.now();
    this.handleServerEvent(event);
  }

  private handleServerEvent(event: VoiceServerEvent): void {
    const interviewId = this.interviewId ?? "";
    switch (event.type) {
      case "session.updated":
      case "session.created":
        break;
      case "input_audio_buffer.speech_started": {
        this.events.onCandidateSpeaking?.(true);
        this.metric("speech_started", { interviewId });
        if (this.assistantSpeaking) {
          if (this.bargeInArmedForTurn) break; // one cancel per turn (CLI parity)
          this.bargeInArmedForTurn = true;
          this.metric("response.cancel", { interviewId, responseId: this.activeResponseId ?? "unknown" });
          this.sendJson({ type: "response.cancel" });
          const startedAt = this.now();
          this.deps.playback.flush();
          this.metric("playback_flush", { interviewId, elapsedMs: this.now() - startedAt });
          this.hasLoggedAudioStart = false;
        } else {
          this.bargeInArmedForTurn = false;
        }
        break;
      }
      case "input_audio_buffer.speech_stopped":
        this.events.onCandidateSpeaking?.(false);
        this.bargeInArmedForTurn = false;
        this.metric("speech_stopped", { interviewId });
        break;
      case "conversation.item.created": {
        const item = event.item as Record<string, unknown> | undefined;
        if (item !== undefined && item["type"] === "function_call") {
          this.handleFunctionCall(
            {
              callId: String(item["call_id"] ?? ""),
              name: String(item["name"] ?? ""),
              argsRaw: item["arguments"],
              item,
            },
            { fallbackToPending: false, store: true, execute: "whenArgsText", previous: "stored" },
          );
        }
        if (item !== undefined && item["type"] === "message" && item["role"] === "user") {
          const transcript = extractTranscript(item["content"]);
          if (transcript !== "") this.events.onTranscript?.(transcript);
        }
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = String(event.transcript ?? "").trim();
        if (transcript !== "") this.events.onTranscript?.(transcript);
        break;
      }
      case "response.created": {
        this.activeResponseId = extractResponseId(event) ?? this.activeResponseId;
        this.setAssistantSpeaking(true);
        this.hasLoggedAudioStart = false;
        // Ordered channel: a new server response proves every submitted
        // output arrived - ack the queue (and clear reload recovery).
        this.ackSubmittedOutputs();
        this.metric("response_created", { interviewId });
        break;
      }
      case "response.output_audio.delta":
      case "response.audio.delta": {
        if (typeof event.delta === "string" && event.delta !== "") {
          if (!this.hasLoggedAudioStart) {
            this.hasLoggedAudioStart = true;
            this.metric("first_audio_delta", { interviewId });
          }
          try {
            this.deps.playback.enqueue(base64ToPcm16(event.delta));
          } catch {
            // Malformed delta: skip the chunk, keep the session alive.
          }
        }
        break;
      }
      case "response.output_audio.done":
      case "response.audio.done":
        this.hasLoggedAudioStart = false;
        break;
      case "response.function_call_arguments.delta":
        break;
      case "response.function_call_arguments.done": {
        this.handleFunctionCall(
          {
            callId: String(event.call_id ?? ""),
            name: String(event.name ?? ""),
            argsRaw: event.arguments,
          },
          { fallbackToPending: true, store: true, execute: "always", previous: "pending" },
        );
        break;
      }
      case "response.output_item.added": {
        const item = event.item as Record<string, unknown> | undefined;
        if (item !== undefined && item["type"] === "function_call") {
          this.handleFunctionCall(
            {
              callId: String(item["call_id"] ?? ""),
              name: String(item["name"] ?? ""),
              argsRaw: item["arguments"],
              item,
            },
            {
              fallbackToPending: false,
              store: true,
              execute: "never",
              previous: "stored",
              onTracked: (call) => this.metric("tool.requested", { interviewId, callId: call.callId, tool: call.name }),
            },
          );
        }
        break;
      }
      case "response.output_item.done": {
        const item = event.item as Record<string, unknown> | undefined;
        if (item !== undefined && item["type"] === "function_call") {
          this.handleFunctionCall(
            {
              callId: String(item["call_id"] ?? ""),
              name: String(item["name"] ?? ""),
              argsRaw: item["arguments"],
              item,
            },
            { fallbackToPending: true, store: false, execute: "always", previous: "itemThenPending" },
          );
        }
        break;
      }
      case "response.cancelled":
      case "response.canceled":
        this.setAssistantSpeaking(false);
        this.bargeInArmedForTurn = false;
        this.hasLoggedAudioStart = false;
        break;
      case "response.done": {
        this.setAssistantSpeaking(false);
        this.bargeInArmedForTurn = false;
        this.hasLoggedAudioStart = false;
        // A function call that only materializes in the final snapshot
        // (CLI parity: execute when it matches the pending call).
        if (this.pendingCall !== null) {
          const output = (event.response as Record<string, unknown> | undefined)?.["output"];
          if (Array.isArray(output)) {
            for (const entry of output as Array<Record<string, unknown>>) {
              if (
                entry["type"] === "function_call" &&
                String(entry["call_id"] ?? "") === this.pendingCall.callId &&
                String(entry["name"] ?? "") === this.pendingCall.name
              ) {
                const args = parseToolArgs(entry["arguments"]) ?? this.pendingCall.args;
                void this.executeTool(
                  this.pendingCall.name,
                  this.pendingCall.callId,
                  previousItemIdOf(entry) ?? this.pendingCall.previousItemId,
                  args,
                );
                return;
              }
            }
          }
        }
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
      case "response.output_text.done": {
        const transcript = String(event.transcript ?? event.text ?? "").trim();
        if (transcript !== "") this.events.onAssistantTranscript?.(transcript);
        break;
      }
      case "response.text.delta":
      case "response.text.done":
        break;
      case "error": {
        const message = event.error === undefined ? event.type : JSON.stringify(event.error);
        this.emitError(new Error(`Voice Live error: ${message.slice(0, 300)}`));
        break;
      }
      default:
        break;
    }
  }

  // Single choke point for model function-call dispatch: resolve call_id and
  // name (optionally against the pending call), guard the tool name, parse
  // args, record the pending call, and optionally execute. Per-event
  // differences stay parameters; response.done keeps its own snapshot-match
  // shape because it matches the pending call instead of parsing a new one.
  private handleFunctionCall(
    source: {
      readonly callId: string;
      readonly name: string;
      readonly argsRaw: unknown;
      readonly item?: Record<string, unknown>;
    },
    behavior: {
      readonly fallbackToPending: boolean;
      readonly store: boolean;
      readonly execute: "always" | "whenArgsText" | "never";
      readonly previous: "stored" | "pending" | "itemThenPending";
      readonly onTracked?: (call: PendingCall) => void;
    },
  ): void {
    const pending = this.pendingCall;
    const callId =
      behavior.fallbackToPending && source.callId === "" ? (pending?.callId ?? "") : source.callId;
    const name =
      behavior.fallbackToPending && source.name === "" ? (pending?.name ?? "") : source.name;
    if (callId === "" || !this.isToolName(name)) return;
    const args = parseToolArgs(source.argsRaw) ?? (behavior.fallbackToPending ? pending?.args : undefined);
    const itemId = source.item === undefined ? undefined : previousItemIdOf(source.item);
    if (behavior.store) {
      this.pendingCall = {
        callId,
        name,
        ...(itemId === undefined ? {} : { previousItemId: itemId }),
        ...(args === undefined ? {} : { args }),
      };
      behavior.onTracked?.(this.pendingCall);
    }
    if (behavior.execute === "never") return;
    if (behavior.execute === "whenArgsText" && String(source.argsRaw ?? "").trim().length <= 2) return;
    const previous =
      behavior.previous === "stored"
        ? this.pendingCall?.previousItemId
        : behavior.previous === "pending"
          ? pending?.previousItemId
          : (itemId ?? pending?.previousItemId);
    void this.executeTool(name, callId, previous, args);
  }

  private async executeTool(tool: ToolName, callId: string, previousItemId?: string, args?: ToolArgs): Promise<void> {
    if (this.handledCallIds.has(callId)) {
      // Duplicate protocol event for an in-session call: already submitted
      // (ledger) - skip. The one exception is a reload-recovered result for
      // the same call_id, served exactly once without re-execution.
      const cached = this.recoveredOutputs.get(callId);
      if (cached !== undefined) {
        this.recoveredOutputs.delete(callId);
        if (this.ledger.enqueue(callId, cached)) {
          this.sendJson(buildFunctionCallOutput(callId, cached, previousItemId));
          this.metric("output_submitted_recovered", { callId, tool });
          if (this.deps.storage !== undefined) {
            removePendingCallId(this.deps.storage, callId);
          }
        }
      }
      return;
    }
    this.handledCallIds.add(callId);
    this.pendingCall = null;
    const interviewId = this.interviewId ?? "";
    this.events.onToolStart?.(callId, tool);
    this.metric("tool.start", { interviewId, callId, tool });
    const startedAt = this.now();
    let output: string;
    let replayed = false;
    try {
      const forwarded = await forwardToolCall(this.deps.toolExecutor, callId, tool, {
        ...(args === undefined ? {} : { args }),
      });
      output = forwarded.output;
      replayed = forwarded.replayed;
    } catch (error) {
      // Exhausted retries (timeout/network/5xx): surface a transient error
      // as the tool output so the model can react instead of stalling.
      const message = error instanceof BackendApiError ? error.message : "Tool execution temporarily unavailable";
      output = JSON.stringify({ call_id: callId, error: { code: "TOOL_UNAVAILABLE", message } });
    }
    const elapsedMs = this.now() - startedAt;
    this.metric("tool.complete", { interviewId, callId, tool, elapsedMs, replayed });

    // Exactly-once output per call_id (ledger) + reload recovery (storage).
    // The entry stays queued as unacked until the server proves receipt by
    // continuing the conversation (see response.created below - an ordered
    // channel guarantees our output arrived before that new response).
    if (!this.ledger.enqueue(callId, output)) return;
    if (this.deps.storage !== undefined && this.interviewId !== null) {
      addPendingCallId(this.deps.storage, callId);
    }
    this.events.onToolComplete?.(callId, tool, elapsedMs, replayed);
    this.sendJson(buildFunctionCallOutput(callId, output, previousItemId));
    this.metric("output_submitted", { interviewId, callId, tool });
    // Let the model reason over the result (CLI parity: +50ms pacing).
    await (this.deps.sleep ?? defaultSleep)(50);
    if (!this.disposed && this.ws !== null && this.connectionState === "connected") {
      this.sendJson({ type: "response.create" });
      this.metric("next_response_started", { interviewId, callId, tool });
    }
  }

  private flushPendingOutputs(): void {
    for (const entry of this.ledger.drainPending()) {
      this.sendJson(buildFunctionCallOutput(entry.callId, entry.output));
      this.metric("output_flushed_on_reconnect", { callId: entry.callId });
    }
  }

  private ackSubmittedOutputs(): void {
    for (const callId of this.ledger.pendingCallIds()) {
      this.ledger.ack(callId);
      if (this.deps.storage !== undefined) {
        removePendingCallId(this.deps.storage, callId);
      }
    }
  }

  private persistPending(): void {
    if (this.deps.storage === undefined) return;
    for (const callId of this.ledger.pendingCallIds()) {
      addPendingCallId(this.deps.storage, callId);
    }
  }

  private handleClose(code: number, reason: string): void {
    if (this.disposed) return;
    this.persistPending();
    this.setAssistantSpeaking(false);
    this.events.onCandidateSpeaking?.(false);
    this.setState("closed");
    this.metric("voice.closed_unexpectedly", { code, reason: reason.slice(0, 120) });
    this.emitError(new Error(`Voice Live connection closed (code ${code})`));
  }

  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws === null) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close();
    } catch {
      // ignore
    }
  }

  private async waitForSessionAck(ws: VoiceWebSocket): Promise<boolean> {
    const timeoutMs = this.deps.sessionAckTimeoutMs ?? 3000;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        ws.onmessage = (event) => {
          this.handleRawMessage(event.data);
        };
        resolve(false);
      }, timeoutMs);
      ws.onmessage = (event) => {
        let type = "";
        try {
          type = (JSON.parse(String(event.data)) as { type?: unknown }).type as string;
        } catch {
          // not JSON - fall through to normal handling
        }
        if (type === "session.updated") {
          clearTimeout(timer);
          ws.onmessage = (evt) => {
            this.handleRawMessage(evt.data);
          };
          resolve(true);
          return;
        }
        this.handleRawMessage(event.data);
      };
    });
  }

  private sendJson(payload: unknown): void {
    const ws = this.ws;
    // Skip sends on a closing/closed socket: the browser logs failed sends
    // to the console even when the throw is caught below, which produced the
    // CLOSING/CLOSED spam when the mic worklet streamed into a dead socket.
    if (ws === null || ws.readyState !== WEB_SOCKET_OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Send failure surfaces via onclose/onerror; never throw into handlers.
    }
  }

  private setState(state: VoiceConnectionState): void {
    this.connectionState = state;
    this.events.onConnectionState?.(state);
  }

  private setAssistantSpeaking(speaking: boolean): void {
    if (this.assistantSpeaking === speaking) return;
    this.assistantSpeaking = speaking;
    this.events.onAssistantSpeaking?.(speaking);
  }

  private metric(event: string, fields?: Record<string, unknown>): void {
    try {
      this.events.onMetric?.(event, fields);
    } catch {
      // metrics must never break the call
    }
  }

  private emitError(error: Error): void {
    try {
      this.events.onError?.(error);
    } catch {
      // ignore
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private isToolName(name: string): name is ToolName {
    return VALID_TOOL_NAMES.includes(name);
  }
}

function extractResponseId(event: VoiceServerEvent): string | null {
  const response = event.response;
  if (typeof response === "object" && response !== null) {
    const id = (response as Record<string, unknown>)["id"];
    if (typeof id === "string" && id !== "") return id;
  }
  if (typeof event.response_id === "string" && event.response_id !== "") return event.response_id;
  if (typeof event.responseId === "string" && event.responseId !== "") return event.responseId;
  return null;
}

function previousItemIdOf(item: Record<string, unknown>): string | undefined {
  const id = item["id"];
  return typeof id === "string" && id !== "" ? id : undefined;
}

function extractTranscript(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content as Array<Record<string, unknown>>) {
    if (part["type"] === "input_text" || part["type"] === "text") {
      const text = String(part["text"] ?? part["transcript"] ?? "").trim();
      if (text !== "") parts.push(text);
    }
    if (part["type"] === "input_audio" && typeof part["transcript"] === "string") {
      const text = part["transcript"].trim();
      if (text !== "") parts.push(text);
    }
  }
  return parts.join(" ");
}
