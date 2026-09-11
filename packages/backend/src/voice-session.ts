// Voice session minting + session parameters (HLD 3.1/3.2, frozen section 3).
//
// Credential boundary: privileged Azure credentials never reach the client.
// The backend mints a short-lived credential and hands the browser ONLY the
// ephemeral credential plus public connection parameters (endpoint, model,
// api version, voice, VAD config). Browser <-> Voice Live stays direct; no
// backend-proxied realtime audio (frozen section 2).
//
// Voice Live auth per the 2026-04-10 API reference supports Microsoft Entra
// (Bearer, recommended) or an api-key header/query. Entra minting (production)
// needs Azure identity infra and lands with S7 auth; until then the server
// supports local-dev-only api-key mode plus an explicit 503 when unconfigured.
// No mint URLs are guessed here: the provider interface keeps the Azure REST
// call behind one seam so S6/S7 can swap it without touching routes.

import type { InterviewId } from "@interview-coach/domain";

export type VoiceCredentialMode = "entra-ephemeral" | "api-key-local-dev" | "test";

export interface VoiceCredential {
  readonly tokenType: "bearer" | "api-key";
  readonly token: string;
}

export interface VoiceSessionMint {
  readonly credential: VoiceCredential;
  readonly mode: VoiceCredentialMode;
  readonly endpoint: string;
  readonly model: string;
  readonly apiVersion: string;
  readonly voiceName: string;
  readonly ttlSeconds: number;
  readonly expiresAt: Date;
}

export interface VoiceSessionProvider {
  readonly mode: VoiceCredentialMode;
  mint(interviewId: InterviewId): Promise<VoiceSessionMint>;
}

export class VoiceNotConfiguredError extends Error {
  constructor() {
    super("Voice session provider is not configured (no Azure credential in env)");
    this.name = "VoiceNotConfiguredError";
  }
}

export class UnconfiguredVoiceSessionProvider implements VoiceSessionProvider {
  readonly mode: VoiceCredentialMode = "entra-ephemeral";

  async mint(_interviewId: InterviewId): Promise<VoiceSessionMint> {
    throw new VoiceNotConfiguredError();
  }
}

// Local-dev-only: hands the server-side API key to the caller as a
// short-lived credential. Never enable outside local development.
export class ApiKeyLocalDevVoiceSessionProvider implements VoiceSessionProvider {
  readonly mode: VoiceCredentialMode = "api-key-local-dev";
  private readonly apiKey: string;
  private readonly ttlSeconds: number;

  constructor(apiKey: string, ttlSeconds: number) {
    this.apiKey = apiKey;
    this.ttlSeconds = ttlSeconds;
  }

  async mint(_interviewId: InterviewId): Promise<VoiceSessionMint> {
    return {
      credential: { tokenType: "api-key", token: this.apiKey },
      mode: this.mode,
      endpoint: "",
      model: "",
      apiVersion: "",
      voiceName: "",
      ttlSeconds: this.ttlSeconds,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
    };
  }
}

export class FakeVoiceSessionProvider implements VoiceSessionProvider {
  readonly mode: VoiceCredentialMode = "test";
  private readonly ttlSeconds: number;

  constructor(ttlSeconds = 600) {
    this.ttlSeconds = ttlSeconds;
  }

  async mint(_interviewId: InterviewId): Promise<VoiceSessionMint> {
    return {
      credential: { tokenType: "bearer", token: "eph_test_token" },
      mode: this.mode,
      endpoint: "",
      model: "",
      apiVersion: "",
      voiceName: "",
      ttlSeconds: this.ttlSeconds,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
    };
  }
}

export function createVoiceSessionProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VoiceSessionProvider {
  const ttlRaw = env["VOICE_EPHEMERAL_TTL_SECONDS"];
  const ttlSeconds =
    ttlRaw === undefined || ttlRaw.trim() === "" ? 600 : Number(ttlRaw);
  const apiKey = env["AZURE_VOICE_API_KEY"]?.trim();
  if (apiKey !== undefined && apiKey !== "") {
    return new ApiKeyLocalDevVoiceSessionProvider(apiKey, ttlSeconds);
  }
  return new UnconfiguredVoiceSessionProvider();
}

// Mirrors the CLI harness buildWebSocketUrl: wss://<origin>/voice-live/realtime.
export function buildVoiceWebSocketUrl(
  endpoint: string,
  apiVersion: string,
  model: string,
): string {
  const url = new URL(endpoint);
  url.protocol = "wss:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/voice-live/realtime`;
  url.search = new URLSearchParams({
    "api-version": apiVersion,
    model,
  }).toString();
  return url.toString();
}

// Validated realtime config, reused as-is (frozen section 3). Returned with
// every mint so web/CLI clients configure the session identically.
export const FROZEN_VOICE_SESSION_CONFIG = {
  audio: {
    inputFormat: "pcm16",
    outputFormat: "pcm16",
    sampleRateHz: 24_000,
    channels: 1,
  },
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
} as const;

const BASE_INSTRUCTIONS =
  "You are a DSA interviewer conducting a live technical interview. " +
  "Be concise, supportive, and rigorous. Ask one question at a time. " +
  "Authoritative interview information (problem, performance, state) must be obtained through tools — do not invent it. " +
  "Use tools when the candidate asks what problem they are solving, how they performed previously, or for interview-specific context. " +
  "After receiving tool results, reason over them and answer naturally. " +
  "Opening behavior: when prompted to speak first at session start, greet the candidate, briefly explain this is a DSA technical interview where you will ask questions, evaluate reasoning, and ask follow-ups, tell the candidate they can think aloud and ask clarifying questions, then ask the candidate to introduce themselves and begin.";

export function buildSessionInstructions(input: {
  candidateId: string;
  interviewId: string;
}): string {
  return [
    BASE_INSTRUCTIONS,
    "",
    "Session context (reference only):",
    `Candidate: ${input.candidateId}`,
    `Interview: ${input.interviewId}`,
    "DSA interview — current problem and history are available ONLY via tools. Do not invent them.",
  ].join("\n");
}
