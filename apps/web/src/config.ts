// @interview-coach/web - runtime config.
//
// Owns: the bundle's only server address (`VITE_BACKEND_URL`) plus the
// local-dev service token. Surprising: no `VITE_AZURE_*` ever; voice
// credentials arrive per-interview and live only in memory.
//
// History: S4; see docs/SESSION_HANDOFF.md.

export interface WebClientConfig {
  readonly backendUrl: string;
  /**
   * S8a service token, local-dev-only (mirrors the server-side
   * `API_AUTH_TOKEN` gate). Ships in the bundle when set, so never use it
   * outside local development - production needs per-user identity (S8b).
   */
  readonly apiToken: string | undefined;
}

const DEFAULT_BACKEND_URL = "http://localhost:3000";

export function loadWebConfig(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): WebClientConfig {
  const raw = env["VITE_BACKEND_URL"];
  const trimmed = raw === undefined ? "" : raw.trim().replace(/\/+$/, "");
  const tokenRaw = env["VITE_API_TOKEN"];
  const token = tokenRaw === undefined || tokenRaw.trim() === "" ? undefined : tokenRaw.trim();
  return {
    backendUrl: trimmed === "" ? DEFAULT_BACKEND_URL : trimmed,
    apiToken: token,
  };
}
