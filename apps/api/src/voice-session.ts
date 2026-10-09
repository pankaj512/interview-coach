// @interview-coach/api - voice session minting and parameters.
//
// Owns: the credential boundary (privileged Azure credentials never reach
// the client; audio stays direct). Surprising: Entra minting
// needs provider infra and is still parked; until then local-dev api-key
// mode plus an explicit 503 when unconfigured.
//
// History: HLD 3.1/3.2; see docs/SESSION_HANDOFF.md.

import type { InterviewId } from "@interview-coach/core";

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

const BASE_INSTRUCTIONS =
  "You are a DSA interviewer conducting a live technical interview. " +
  "Be concise, supportive, and rigorous. Ask one question at a time. " +
  "The session context below is authoritative backend state: use it to ground the interview. " +
  "Any interview information not provided there (live progress, deeper history) must be obtained through tools - never invent it. " +
  "Use tools when the candidate asks what problem they are solving, how they performed previously, or for interview-specific context. " +
  "After receiving tool results, reason over them and answer naturally. " +
  "Opening behavior: when prompted to speak first at session start, greet the candidate by name if known, briefly explain this is a DSA technical interview where you will ask questions, evaluate reasoning, and ask follow-ups, tell the candidate they can think aloud and ask clarifying questions, then state the current problem from the session context in your own words (title, difficulty, and what it asks) and invite the candidate to introduce themselves and begin. If no problem is in context, ask the candidate to introduce themselves and begin.";

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
  const lines = [
    BASE_INSTRUCTIONS,
    "",
    "Interview conduct (HLD Phase 5):",
    "- Ask one question at a time; probe reasoning before giving hints.",
    "- Hint policy: give at most 3 escalating tiers conversationally (1 concept nudge, 2 approach scaffold, 3 detailed plan). Never reveal or dictate the final code.",
    "- Record what the candidate says with submit_interview_data (kind: answer/approach/code/question/note plus content) so the backend persists it. Persist candidate code the same way (language javascript|python, code, problemId?).",
    "- Read the candidate's live editor code with get_candidate_code when they ask what you can see or when discussing their implementation. It returns the current editor content, which may be newer than the last tested submission.",
    "- After a Submit result arrives, or when the candidate refers to submitted code, fetch it fresh with get_last_submission (the live editor may have moved on). It returns found:false when nothing was submitted yet.",
    "- Code execution stays outside the realtime tools: the candidate runs code in the app workspace - ask them to share the run outcome, then discuss it. Timeout/error outcomes are results - discuss them, don't treat them as tool failures. Hidden cases report pass/fail only; never invent their contents.",
    "- Read interview rules and progress with get_current_interview; read the current problem with get_current_problem.",
    "- Signal done with end_interview only when the candidate has finished; the app finalizes state.",
    "",
    "Session context (authoritative backend state):",
    `Candidate: ${context.candidateId}`,
    `Interview: ${context.interviewId}`,
    "Anything not stated here (live progress, deeper history, problem details) is available ONLY via tools. Do not invent it.",
  ];
  if (context.profileSummary !== undefined && context.profileSummary !== "") {
    lines.push(`Learner: ${context.profileSummary}.`);
  }
  if (context.configurationSummary !== undefined && context.configurationSummary !== "") {
    lines.push(`Configuration: ${context.configurationSummary}`);
  }
  if (context.topicSummary !== undefined && context.topicSummary !== "") {
    lines.push(`Focus topic: ${context.topicSummary}.`);
  }
  if (context.objectiveSummary !== undefined && context.objectiveSummary !== "") {
    lines.push(`Learning objective: ${context.objectiveSummary}.`);
  }
  if (context.skillSummary !== undefined && context.skillSummary !== "") {
    lines.push(`Prior skill state: ${context.skillSummary}.`);
  }
  if (context.problemSummary !== undefined && context.problemSummary !== "") {
    lines.push(`Current problem: ${context.problemSummary}`);
  }
  if (context.responseCount !== undefined || context.hintsUsed !== undefined) {
    lines.push(
      `Progress: ${context.responseCount ?? 0} recorded responses, ${context.hintsUsed ?? 0} hints used.`,
    );
  }
  if (context.sandboxSummary !== undefined && context.sandboxSummary !== "") {
    lines.push(`Code: ${context.sandboxSummary}.`);
  }
  return lines.join("\n");
}
