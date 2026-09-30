// @interview-coach/backend - server configuration (HLD Phase 3 / S3).
// Env-driven. Azure voice credentials stay server-side; only derived,
// non-secret session parameters ever leave the backend (frozen sections 3, 7).

import {
  INCEPTION_DEFAULT_BASE_URL,
  INCEPTION_DEFAULT_MODEL,
} from "./llm-transport.js";

export interface VoiceConfig {
  readonly endpoint: string;
  readonly model: string;
  readonly apiVersion: string;
  readonly voiceName: string;
  readonly ephemeralTtlSeconds: number;
  /** Max live entries in the in-memory activeVoiceSessions map (S8a quota). */
  readonly maxActiveSessions: number;
}

export interface ToolsConfig {
  readonly idempotencyTtlMs: number;
  readonly idempotencyMaxEntries: number;
}

export interface RateLimitConfig {
  /** Per-minute caps on the expensive paths (S8a abuse protection). */
  readonly globalPerMin: number;
  readonly toolExecPerMin: number;
  readonly voiceMintPerMin: number;
  readonly codeRunPerMin: number;
  /** S8c: strict budget on credential endpoints (brute-force protection). */
  readonly authPerMin: number;
  /** Phase 4: budget on LLM-backed recommendation generation. */
  readonly recommendationPerMin: number;
}

export interface AuthConfig {
  /** Opaque session lifetime (S8c local credentials). */
  readonly sessionTtlMs: number;
}

export interface SandboxConfig {
  /** Default per-run wall-clock timeout (ms) when the caller omits one. */
  readonly defaultTimeoutMs: number;
  /** Cap on serialized per-case actuals kept in run results. */
  readonly maxActualChars: number;
  /** Max concurrent Docker runner executions (S8a quota; 429 past it). */
  readonly maxConcurrentRuns: number;
  /** Max stored submissions per interview (S8a quota; 429 past it). */
  readonly maxSubmissionsPerInterview: number;
  /** Container images per language for the Docker runner. */
  readonly runnerImages: { javascript: string; python: string; cpp: string };
  /** Per-run container caps for the Docker runner. */
  readonly runnerMemory: string;
  readonly runnerCpus: string;
  readonly runnerPidsLimit: number;
}

// Learning-loop Phase 4 (ADR-002): server-side Azure AI Foundry text model for
// recommendation. Credentials stay server-side (never in the browser). When
// endpoint/apiKey are absent the recommendation service uses its deterministic
// fallback, so the loop works without an LLM in local dev.
export interface LlmConfig {
  readonly endpoint: string | undefined;
  readonly apiKey: string | undefined;
  readonly deployment: string;
  readonly apiVersion: string;
  readonly provider: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

export interface BackendConfig {
  readonly host: string;
  readonly port: number;
  readonly corsOrigin: string | string[];
  /** Shared-service bearer token (S8a). Undefined = open local-dev mode. */
  readonly authToken: string | undefined;
  readonly auth: AuthConfig;
  readonly voice: VoiceConfig;
  readonly tools: ToolsConfig;
  readonly rateLimits: RateLimitConfig;
  readonly sandbox: SandboxConfig;
  readonly llm: LlmConfig;
}

function num(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: must be a positive number`);
  }
  return parsed;
}

function str(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const raw = env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

// CORS_ORIGIN may be a comma-separated list (e.g. localhost + 127.0.0.1, since
// Vite prints the 127.0.0.1 URL while the backend default allows localhost).
function origins(env: NodeJS.ProcessEnv, name: string, fallback: string): string | string[] {
  const raw = str(env, name, fallback);
  const parts = raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (parts.length <= 1) return parts[0] ?? fallback;
  return parts;
}

// Optional shared secret: empty/absent keeps the historical open local-dev
// mode (S8a). Production user identity (Entra/OIDC) stays on the S8b track.
function optSecret(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  return raw.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  return {
    host: str(env, "HOST", "127.0.0.1"),
    port: num(env, "PORT", 3000),
    corsOrigin: origins(env, "CORS_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173"),
    authToken: optSecret(env, "API_AUTH_TOKEN"),
    auth: {
      // F7-3: 7-day default (was 30) for the stored bearer session.
      sessionTtlMs: num(env, "AUTH_SESSION_TTL_HOURS", 168) * 3_600_000,
    },
    voice: {
      endpoint: str(
        env,
        "AZURE_VOICE_ENDPOINT",
        "https://interview-coach-voice.services.ai.azure.com",
      ),
      model: str(env, "AZURE_VOICE_MODEL", "gpt-realtime-mini"),
      apiVersion: str(env, "AZURE_VOICE_API_VERSION", "2026-04-10"),
      // Realtime voices are a closed set (alloy, ash, ballad, coral,
      // echo, sage, shimmer, verse, marin, cedar): Azure rejects Azure
      // speech names such as en-US-Andrew with
      // invalid_session_update_message on session.voice.
      voiceName: str(env, "AZURE_VOICE_VOICE", "alloy"),
      ephemeralTtlSeconds: num(env, "VOICE_EPHEMERAL_TTL_SECONDS", 600),
      maxActiveSessions: num(env, "VOICE_MAX_ACTIVE_SESSIONS", 200),
    },
    tools: {
      // Locked defaults (frozen section 5): 30 min TTL.
      // TOOL_EXEC_TIMEOUT_MS / TOOL_EXEC_MAX_RETRIES govern the browser
      // forwarder; the backend documents them but does not enforce them.
      idempotencyTtlMs: num(env, "TOOL_IDEMPOTENCY_TTL_MINUTES", 30) * 60_000,
      idempotencyMaxEntries: 2000,
    },
    rateLimits: {
      globalPerMin: num(env, "RATE_LIMIT_GLOBAL_PER_MIN", 1000),
      toolExecPerMin: num(env, "RATE_LIMIT_TOOL_EXEC_PER_MIN", 120),
      voiceMintPerMin: num(env, "RATE_LIMIT_VOICE_MINT_PER_MIN", 60),
      codeRunPerMin: num(env, "RATE_LIMIT_CODE_RUN_PER_MIN", 30),
      authPerMin: num(env, "RATE_LIMIT_AUTH_PER_MIN", 10),
      recommendationPerMin: num(env, "RATE_LIMIT_RECOMMENDATION_PER_MIN", 30),
    },
    sandbox: {
      // Feature 16 Docker runner (HLD Phase 6): per-run containers with
      // --network=none + memory/CPU/pids caps. Images must be pre-pulled
      // or pullable; without a daemon, runs persist as `error` runs.
      defaultTimeoutMs: num(env, "CODE_RUN_TIMEOUT_MS", 5000),
      maxActualChars: num(env, "CODE_RUN_MAX_OUTPUT_CHARS", 20000),
      maxConcurrentRuns: num(env, "CODE_RUN_MAX_CONCURRENT", 4),
      maxSubmissionsPerInterview: num(env, "CODE_RUN_MAX_SUBMISSIONS_PER_INTERVIEW", 100),
      runnerImages: {
        javascript: str(env, "SANDBOX_IMAGE_JS", "node:24-slim"),
        python: str(env, "SANDBOX_IMAGE_PY", "gcc:14-bookworm"),
        cpp: str(env, "SANDBOX_IMAGE_CPP", "gcc:14-bookworm"),
      },
      runnerMemory: str(env, "SANDBOX_MEMORY", "512m"),
      runnerCpus: str(env, "SANDBOX_CPUS", "1.0"),
      runnerPidsLimit: num(env, "SANDBOX_PIDS_LIMIT", 128),
    },
    llm: {
      // Phase 4 recommendation model. Unset endpoint/key = deterministic
      // fallback (the loop still works); never exposed to the browser.
      endpoint: optSecret(env, "LLM_ENDPOINT"),
      apiKey: optSecret(env, "LLM_API_KEY"),
      deployment: str(env, "LLM_DEPLOYMENT", "gpt-4o-mini"),
      apiVersion: str(env, "LLM_API_VERSION", "2024-10-21"),
      // Feature 21 provider switch: azure = Azure AI Foundry deployment
      // path; inception = Inception Mercury OpenAI-compatible API.
      // Anything else behaves as unconfigured (same as missing keys).
      provider: str(env, "LLM_PROVIDER", "azure"),
      baseUrl: str(env, "LLM_BASE_URL", INCEPTION_DEFAULT_BASE_URL),
      model: str(env, "LLM_MODEL", INCEPTION_DEFAULT_MODEL),
      timeoutMs: num(env, "LLM_TIMEOUT_MS", 10_000),
      maxRetries: num(env, "LLM_MAX_RETRIES", 2),
    },
  };
}
