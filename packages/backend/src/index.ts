// @interview-coach/backend - Fastify product service (HLD Phase 3 / S3).
// Backend owns truth; the model owns conversation. Realtime audio is never
// proxied here (frozen section 2).
export * from "./config.js";
export * from "./http-errors.js";
export * from "./idempotency.js";
export * from "./serializers.js";
export * from "./voice-session.js";
export * from "./auth.js";
export * from "./metrics.js";
export * from "./prometheus.js";
export * from "./rate-limit.js";
export * from "./users.js";
export { buildApp, type ActiveVoiceSession, type BuildAppDeps, type BuiltBackend } from "./app.js";
