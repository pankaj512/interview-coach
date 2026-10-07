// Production entrypoint: Fastify + Drizzle/Postgres (HLD Phase 3 / S3).
// Run: DATABASE_URL=... pnpm --filter @interview-coach/api dev
// Problems must be seeded first: pnpm --filter @interview-coach/store db:seed

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDatabase, createDrizzleRepositories } from "@interview-coach/store";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createVoiceSessionProviderFromEnv } from "./voice-session.js";

// Local-dev convenience: read the repo-root .env when present so directly-run
// `dev`/`start` picks up DATABASE_URL without manual sourcing. Exported
// variables keep precedence (native loader never overrides), and a missing
// file boots exactly as before (compose and production inject env directly).
const rootEnvFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const config = loadConfig();
const database = createDatabase();
const { app } = buildApp({
  repos: createDrizzleRepositories(database.db),
  config,
  voiceProvider: createVoiceSessionProviderFromEnv(
    process.env,
    config.voice.ephemeralTtlSeconds,
  ),
  logger: true,
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutdown");
  await app.close();
  await database.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(signal).catch((error: unknown) => {
      app.log.error({ err: error }, "shutdown failed");
      process.exitCode = 1;
    });
  });
}

await app.listen({ host: config.host, port: config.port });
