// Production entrypoint: Fastify + Drizzle/Postgres (HLD Phase 3 / S3).
// Run: DATABASE_URL=... pnpm --filter @interview-coach/backend dev
// Problems must be seeded first: pnpm --filter @interview-coach/db db:seed

import { createDatabase, createDrizzleRepositories } from "@interview-coach/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createVoiceSessionProviderFromEnv } from "./voice-session.js";

const config = loadConfig();
const database = createDatabase();
const { app } = buildApp({
  repos: createDrizzleRepositories(database.db),
  config,
  voiceProvider: createVoiceSessionProviderFromEnv(),
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
