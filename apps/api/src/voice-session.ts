// @interview-coach/api - voice session minting and parameters.
//
// Owns: the credential boundary (privileged Azure credentials never reach
// the client; audio stays direct). Surprising: Entra minting
// needs provider infra and is still parked; until then local-dev api-key
// mode plus an explicit 503 when unconfigured.
//
// History: HLD 3.1/3.2; 26; see docs/SESSION_HANDOFF.md.

import type { InterviewId } from "@interview-coach/core";
import { loadPromptSet } from "./prompts/loader.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type VoiceCredentialMode =
  | "entra-ephemeral"
  | "api-key-local-dev"
  | "unconfigured"
  | "test";

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
  // Distinct mode (audit F8-4): /api/ready must not advertise "entra-ephemeral"
  // when every mint 503s.
  readonly mode: VoiceCredentialMode = "unconfigured";

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
  ttlSeconds: number,
): VoiceSessionProvider {
  const apiKey = env["AZURE_VOICE_API_KEY"]?.trim();
  if (apiKey !== undefined && apiKey !== "") {
    // V3-5: api-key mode returns the long-lived server key verbatim, so it is
    // local-dev-only by convention. Enforce it: a production process refuses
    // to start with the key unless the operator explicitly opts in.
    if (
      env["NODE_ENV"] === "production" &&
      env["ALLOW_INSECURE_VOICE_API_KEY"] !== "true"
    ) {
      throw new Error(
        "AZURE_VOICE_API_KEY (api-key voice mode) is local-dev only. " +
          "Use Entra ephemeral minting in production, or set " +
          "ALLOW_INSECURE_VOICE_API_KEY=true to override explicitly.",
      );
    }
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

// Session instructions are file-owned (prompts/voice-session/): loaded per
// call because interpolation vars differ per mint. A broken prompt file
// throws fail-closed instead of sending a broken prompt.
const VOICE_SESSION_PROMPT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "prompts",
  "voice-session",
);

export interface SessionInstructionContext {
  readonly candidateId: string;
  readonly interviewId: string;
  /** HLD 5.2 structured context: interview configuration summary. */
  readonly configurationSummary?: string;
  /** Current problem summary: "Title (Difficulty) - concepts". */
  readonly problemSummary?: string;
  readonly responseCount?: number;
  readonly hintsUsed?: number;
  /** S7a sandbox progress: e.g. "2 submissions, latest run failed (1/3)". */
  readonly sandboxSummary?: string;
  /** Phase 7: who the candidate is preparing to be + stated goal. */
  readonly profileSummary?: string;
  /** Phase 7: recommended curriculum topic (+ owning module). */
  readonly topicSummary?: string;
  /** Phase 7: topic/module learning objective. */
  readonly objectiveSummary?: string;
  /** Phase 7: prior mastery + strengths/focus areas for the topic. */
  readonly skillSummary?: string;
}

export function buildSessionInstructions(input: {
  candidateId: string;
  interviewId: string;
  configurationSummary?: string;
  problemSummary?: string;
  responseCount?: number;
  hintsUsed?: number;
  sandboxSummary?: string;
  profileSummary?: string;
  topicSummary?: string;
  objectiveSummary?: string;
  skillSummary?: string;
}): string {
  const context: SessionInstructionContext = input;
  const set = loadPromptSet(VOICE_SESSION_PROMPT_DIR, {
    candidateId: context.candidateId,
    interviewId: context.interviewId,
    profileSummary: context.profileSummary ?? "",
    configurationSummary: context.configurationSummary ?? "",
    topicSummary: context.topicSummary ?? "",
    objectiveSummary: context.objectiveSummary ?? "",
    skillSummary: context.skillSummary ?? "",
    problemSummary: context.problemSummary ?? "",
    responseCount: String(context.responseCount ?? 0),
    hintsUsed: String(context.hintsUsed ?? 0),
    sandboxSummary: context.sandboxSummary ?? "",
  });
  const line = (name: string): string => {
    const rendered = set[name];
    if (rendered === undefined) {
      throw new Error(`Prompt "${name}" missing from ${VOICE_SESSION_PROMPT_DIR}`);
    }
    return rendered;
  };
  const lines = line("session-base").split("\n");
  if (context.profileSummary !== undefined && context.profileSummary !== "") {
    lines.push(line("learner-line"));
  }
  if (context.configurationSummary !== undefined && context.configurationSummary !== "") {
    lines.push(line("configuration-line"));
  }
  if (context.topicSummary !== undefined && context.topicSummary !== "") {
    lines.push(line("focus-topic-line"));
  }
  if (context.objectiveSummary !== undefined && context.objectiveSummary !== "") {
    lines.push(line("objective-line"));
  }
  if (context.skillSummary !== undefined && context.skillSummary !== "") {
    lines.push(line("skill-line"));
  }
  if (context.problemSummary !== undefined && context.problemSummary !== "") {
    lines.push(line("problem-line"));
  }
  if (context.responseCount !== undefined || context.hintsUsed !== undefined) {
    lines.push(line("progress-line"));
  }
  if (context.sandboxSummary !== undefined && context.sandboxSummary !== "") {
    lines.push(line("code-line"));
  }
  return lines.join("\n");
}
