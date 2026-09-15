// @interview-coach/domain — backend-owned truth for interviews (HLD Phase 1).
// Pure domain layer: entities, lifecycle, services, tool contracts.
// No I/O, no HTTP, no DB driver; repositories are interfaces with
// in-memory implementations for unit tests (Drizzle/Postgres lands in S2).
export * from "./result.js";
export * from "./errors.js";
export * from "./ids.js";
export * from "./user.js";
export * from "./profile.js";
export * from "./problem.js";
export * from "./interview.js";
export * from "./lifecycle.js";
export * from "./candidate-response.js";
export * from "./interview-message.js";
export * from "./evaluation.js";
export * from "./evaluation-job.js";
export * from "./evaluation-model.js";
export * from "./interview-event.js";
export * from "./repositories.js";
export * from "./interview-service.js";
export * from "./tool-service.js";
export * from "./catalog.js";
export * from "./selection.js";
export * from "./curriculum.js";
export * from "./skill.js";
export * from "./recommendation.js";
export * from "./hints.js";
export * from "./evaluation-pipeline.js";
export * from "./submission.js";
export * from "./submission-service.js";
