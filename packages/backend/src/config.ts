// @interview-coach/backend — server configuration (HLD Phase 3 / S3).
// Env-driven. Azure voice credentials stay server-side; only derived,
// non-secret session parameters ever leave the backend (frozen sections 3, 7).

export interface VoiceConfig {
  readonly endpoint: string;
  readonly model: string;
  readonly apiVersion: string;
  readonly voiceName: string;
  readonly ephemeralTtlSeconds: number;
}

export interface ToolsConfig {
  readonly idempotencyTtlMs: number;
  readonly idempotencyMaxEntries: number;
}

export interface SandboxConfig {
  /** Default per-run wall-clock timeout (ms) when the caller omits one. */
  readonly defaultTimeoutMs: number;
  /** Cap on serialized per-case actuals kept in run results. */
  readonly maxActualChars: number;
}

export interface BackendConfig {
  readonly host: string;
  readonly port: number;
  readonly corsOrigin: string | string[];
  readonly voice: VoiceConfig;
  readonly tools: ToolsConfig;
  readonly sandbox: SandboxConfig;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  return {
    host: str(env, "HOST", "127.0.0.1"),
    port: num(env, "PORT", 3000),
    corsOrigin: str(env, "CORS_ORIGIN", "http://localhost:5173"),
    voice: {
      endpoint: str(
        env,
        "AZURE_VOICE_ENDPOINT",
        "https://interview-coach-voice.services.ai.azure.com",
      ),
      model: str(env, "AZURE_VOICE_MODEL", "gpt-realtime-mini"),
      apiVersion: str(env, "AZURE_VOICE_API_VERSION", "2026-04-10"),
      voiceName: str(env, "AZURE_VOICE_VOICE", "en-US-Andrew:DragonHDLatestNeural"),
      ephemeralTtlSeconds: num(env, "VOICE_EPHEMERAL_TTL_SECONDS", 600),
    },
    tools: {
      // Locked defaults (frozen section 5): 30 min TTL.
      // TOOL_EXEC_TIMEOUT_MS / TOOL_EXEC_MAX_RETRIES govern the browser
      // forwarder; the backend documents them but does not enforce them.
      idempotencyTtlMs: num(env, "TOOL_IDEMPOTENCY_TTL_MINUTES", 30) * 60_000,
      idempotencyMaxEntries: 2000,
    },
    sandbox: {
      // S7a local runner (HLD Phase 6): wall-clock kill + output caps.
      // Local-dev bounds; container isolation is the S8 follow-up.
      defaultTimeoutMs: num(env, "CODE_RUN_TIMEOUT_MS", 5000),
      maxActualChars: num(env, "CODE_RUN_MAX_OUTPUT_CHARS", 20000),
    },
  };
}
