// @interview-coach/backend — Fastify product service (HLD Phase 3 / S3).
//
// Backend owns truth; the model owns conversation. Every route reads or
// mutates backend-owned interview state via the S1 domain services (same
// async signatures as S2 Postgres repos). Realtime audio is never proxied
// here: the browser talks to Voice Live directly with a backend-minted
// ephemeral credential, and model tool calls come back via tool-exec.
//
// Routes (HLD 1.3 + S3 extensions marked):
//   GET    /api/health
//   POST   /api/interviews
//   GET    /api/interviews/:id
//   GET    /api/interviews/:id/state
//   POST   /api/interviews/:id/ready            (extension: lifecycle needs it)
//   POST   /api/interviews/:id/start
//   POST   /api/interviews/:id/end
//   POST   /api/interviews/:id/problems         (extension: attach problems)
//   GET    /api/problems/:id
//   POST   /api/interviews/:id/tool-exec        (call_id idempotency, frozen §5)
//   GET    /api/interviews/:id/tool-results/:call_id (recovery)
//   POST   /api/interviews/:id/voice-session
//   DELETE /api/interviews/:id/voice-session

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  InterviewService,
  ToolService,
  asInterviewId,
  asProblemId,
  asUserId,
  type InterviewConfiguration,
  type InterviewId,
  type RepositorySet,
  type ToolName,
  type ToolResult,
} from "@interview-coach/domain";
import { loadConfig, type BackendConfig } from "./config.js";
import {
  CallIdConflictError,
  IdempotencyStore,
} from "./idempotency.js";
import { sendApiError, sendDomainError } from "./http-errors.js";
import { serializeInterview, serializeStateSnapshot } from "./serializers.js";
import {
  FROZEN_VOICE_SESSION_CONFIG,
  VoiceNotConfiguredError,
  buildSessionInstructions,
  buildVoiceWebSocketUrl,
  type VoiceSessionProvider,
} from "./voice-session.js";
import { createVoiceSessionProviderFromEnv } from "./voice-session.js";

export interface BuildAppDeps {
  readonly repos: RepositorySet;
  readonly config?: BackendConfig;
  readonly voiceProvider?: VoiceSessionProvider;
  readonly logger?: boolean;
}

export interface BuiltBackend {
  readonly app: FastifyInstance;
  readonly toolIdempotency: IdempotencyStore<ToolResult>;
  readonly activeVoiceSessions: Map<string, ActiveVoiceSession>;
}

export interface ActiveVoiceSession {
  readonly interviewId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

const VERSION = "0.1.0";

const configurationSchema = z.object({
  interviewType: z.literal("dsa"),
  difficulty: z.enum(["Easy", "Medium", "Mixed"]).optional(),
  durationMinutes: z.number().int().positive().max(480).optional(),
  problemCount: z.number().int().positive().max(20).optional(),
  topicFocus: z.array(z.string().min(1).max(120)).max(20).optional(),
});

const createInterviewSchema = z.object({
  candidateId: z.string().min(1).max(200),
  configuration: configurationSchema,
});

const assignProblemsSchema = z.object({
  problemIds: z.array(z.string().min(1).max(200)).min(1).max(50),
});

const TOOL_NAMES = [
  "get_current_problem",
  "get_interview_state",
  "get_candidate_performance",
  "end_interview",
] as const;

const toolExecSchema = z.object({
  call_id: z.string().min(1).max(200),
  tool: z.enum(TOOL_NAMES),
});

const idParamSchema = z.object({ id: z.string().min(1).max(200) });

const callIdParamSchema = z.object({
  id: z.string().min(1).max(200),
  call_id: z.string().min(1).max(200),
});

function toDomainConfiguration(
  input: z.infer<typeof configurationSchema>,
): InterviewConfiguration {
  return {
    interviewType: input.interviewType,
    ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
    ...(input.durationMinutes === undefined
      ? {}
      : { durationMinutes: input.durationMinutes }),
    ...(input.problemCount === undefined
      ? {}
      : { problemCount: input.problemCount }),
    ...(input.topicFocus === undefined ? {} : { topicFocus: input.topicFocus }),
  };
}

function zodMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (first === undefined) return "Invalid request";
  const path = first.path.join(".");
  return path === "" ? first.message : `${path}: ${first.message}`;
}

export function buildApp(deps: BuildAppDeps): BuiltBackend {
  const config = deps.config ?? loadConfig();
  const voiceProvider = deps.voiceProvider ?? createVoiceSessionProviderFromEnv();
  const app = Fastify({ logger: deps.logger ?? true });
  const toolIdempotency = new IdempotencyStore<ToolResult>({
    ttlMs: config.tools.idempotencyTtlMs,
    maxEntries: config.tools.idempotencyMaxEntries,
  });
  const activeVoiceSessions = new Map<string, ActiveVoiceSession>();

  const interviews = new InterviewService({ ...deps.repos });
  const tools = new ToolService({
    interviews,
    responses: deps.repos.responses,
    events: deps.repos.events,
  });

  void app.register(cors, { origin: config.corsOrigin });
  // Present per the locked stack; abuse tuning lands in S8 hardening.
  void app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });

  app.setNotFoundHandler((request, reply) => {
    sendApiError(reply, 404, "NOT_FOUND", `No route for ${request.url}`, false);
  });

  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;
    const fastifyError = error as { statusCode?: unknown; message?: unknown };
    const statusCode =
      typeof fastifyError.statusCode === "number" ? fastifyError.statusCode : 500;
    const message =
      typeof fastifyError.message === "string" && fastifyError.message !== ""
        ? fastifyError.message
        : "Unexpected backend error";
    if (statusCode >= 400 && statusCode < 500) {
      // Fastify client errors (malformed/empty JSON body, oversized
      // payload): permanent, never retried as-is.
      sendApiError(reply, statusCode, "VALIDATION_ERROR", message, false);
      return;
    }
    request.log.error({ err: error }, "unhandled request error");
    sendApiError(reply, 500, "INTERNAL_ERROR", "Unexpected backend error", true);
  });

  app.addHook("onClose", (_instance, done) => {
    toolIdempotency.close();
    done();
  });

  app.get("/api/health", (_request, reply) => {
    reply.send({ ok: true, service: "interview-coach-backend", version: VERSION });
  });

  app.post("/api/interviews", async (request, reply) => {
    const parsed = createInterviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const created = await interviews.createInterview({
      candidateId: asUserId(parsed.data.candidateId),
      configuration: toDomainConfiguration(parsed.data.configuration),
    });
    if (!created.ok) return sendDomainError(reply, created.error);
    request.log.info({ interviewId: created.value.id }, "interview.created");
    return reply.status(201).send({ ok: true, interview: serializeInterview(created.value) });
  });

  app.get("/api/interviews/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const interview = await deps.repos.interviews.findById(asInterviewId(params.data.id));
    if (interview === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Interview ${params.data.id} does not exist`, false);
    }
    return reply.send({ ok: true, interview: serializeInterview(interview) });
  });

  app.get("/api/interviews/:id/state", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const state = await interviews.getState(asInterviewId(params.data.id));
    if (!state.ok) return sendDomainError(reply, state.error);
    return reply.send({ ok: true, state: serializeStateSnapshot(state.value) });
  });

  app.post("/api/interviews/:id/ready", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const next = await interviews.markReady(asInterviewId(params.data.id));
    if (!next.ok) return sendDomainError(reply, next.error);
    request.log.info({ interviewId: next.value.id, to: "ready" }, "interview.lifecycle");
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
  });

  app.post("/api/interviews/:id/start", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const next = await interviews.start(asInterviewId(params.data.id));
    if (!next.ok) return sendDomainError(reply, next.error);
    request.log.info({ interviewId: next.value.id, to: "in_progress" }, "interview.lifecycle");
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
  });

  // App-only finalization: in_progress/paused -> completing -> completed in
  // one request. Idempotent for completed. The model never calls this; it
  // signals done via the end_interview tool (which stops at completing).
  app.post("/api/interviews/:id/end", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const id = asInterviewId(params.data.id);
    const state = await interviews.getState(id);
    if (!state.ok) return sendDomainError(reply, state.error);
    const status = state.value.interview.status;
    if (status === "completed") {
      return reply.send({
        ok: true,
        interview: serializeInterview(state.value.interview),
        transitioned: false,
      });
    }
    if (status === "completing") {
      const done = await interviews.complete(id);
      if (!done.ok) return sendDomainError(reply, done.error);
      request.log.info({ interviewId: id, to: "completed" }, "interview.lifecycle");
      return reply.send({ ok: true, interview: serializeInterview(done.value), transitioned: true });
    }
    if (status === "in_progress" || status === "paused") {
      const completing = await interviews.beginCompleting(id);
      if (!completing.ok) return sendDomainError(reply, completing.error);
      const done = await interviews.complete(id);
      if (!done.ok) return sendDomainError(reply, done.error);
      request.log.info({ interviewId: id, to: "completed" }, "interview.lifecycle");
      return reply.send({ ok: true, interview: serializeInterview(done.value), transitioned: true });
    }
    return sendApiError(
      reply,
      409,
      "ILLEGAL_TRANSITION",
      `Cannot end interview ${params.data.id} while ${status}`,
      false,
    );
  });

  app.post("/api/interviews/:id/problems", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = assignProblemsSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const next = await interviews.assignProblems(
      asInterviewId(params.data.id),
      parsed.data.problemIds.map((p) => asProblemId(p)),
    );
    if (!next.ok) return sendDomainError(reply, next.error);
    request.log.info(
      { interviewId: next.value.id, count: next.value.problems.length },
      "problem.assigned",
    );
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
  });

  app.get("/api/problems/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const problem = await deps.repos.problems.findById(asProblemId(params.data.id));
    if (problem === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Problem ${params.data.id} does not exist`, false);
    }
    return reply.send({ ok: true, problem });
  });

  app.post("/api/interviews/:id/tool-exec", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = toolExecSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const interviewId = asInterviewId(params.data.id);
    const exists = await deps.repos.interviews.findById(interviewId);
    if (exists === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Interview ${params.data.id} does not exist`, false);
    }
    const callId = parsed.data.call_id;
    const tool = parsed.data.tool as ToolName;
    request.log.info({ interviewId: interviewId as string, callId, tool }, "tool.received");
    const startedAt = Date.now();
    let outcome;
    try {
      outcome = await toolIdempotency.execute(callId, interviewId as string, tool, async () => {
        const result = await tools.dispatch(tool, { interviewId, callId });
        if (result.ok) return { ok: true as const, result: result.value, error: null };
        return { ok: false as const, result: null, error: result.error };
      });
    } catch (error) {
      if (error instanceof CallIdConflictError) {
        return sendDomainError(reply, error.toDomainError());
      }
      throw error;
    }
    const elapsedMs = Date.now() - startedAt;
    request.log.info(
      { interviewId: interviewId as string, callId, tool, elapsedMs, replayed: outcome.replayed, ok: outcome.record.ok },
      "tool.executed",
    );
    const record = outcome.record;
    if (record.ok) {
      return reply.send({
        ok: true,
        callId: record.callId,
        tool: record.tool,
        result: record.result,
        replayed: outcome.replayed,
      });
    }
    // record.error is non-null when ok is false (stored by execute above).
    const { status, body } = errorBody(record);
    return reply.status(status).send({
      ...body,
      callId: record.callId,
      tool: record.tool,
      replayed: outcome.replayed,
    });
  });

  app.get("/api/interviews/:id/tool-results/:call_id", async (request, reply) => {
    const params = callIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const interviewId = params.data.id;
    const exists = await deps.repos.interviews.findById(asInterviewId(interviewId));
    if (exists === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Interview ${interviewId} does not exist`, false);
    }
    const record = toolIdempotency.get(params.data.call_id);
    if (record === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `No result for call_id ${params.data.call_id}`, false);
    }
    if (record.interviewId !== interviewId) {
      return sendApiError(reply, 409, "CONFLICT", "call_id is already bound to another interview", false);
    }
    if (record.ok) {
      return reply.send({
        ok: true,
        callId: record.callId,
        tool: record.tool,
        result: record.result,
        replayed: true,
      });
    }
    const { status, body } = errorBody(record);
    return reply.status(status).send({
      ...body,
      callId: record.callId,
      tool: record.tool,
      replayed: true,
    });
  });

  app.post("/api/interviews/:id/voice-session", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const id: InterviewId = asInterviewId(params.data.id);
    const state = await interviews.getState(id);
    if (!state.ok) return sendDomainError(reply, state.error);
    const status = state.value.interview.status;
    if (status === "ready") {
      // Opening a voice session starts the interview (app transition, not model).
      const started = await interviews.start(id);
      if (!started.ok) return sendDomainError(reply, started.error);
    } else if (status !== "in_progress" && status !== "paused") {
      return sendApiError(
        reply,
        409,
        "ILLEGAL_TRANSITION",
        `Voice session requires a ready or running interview (current: ${status})`,
        false,
      );
    }
    let mint;
    try {
      mint = await voiceProvider.mint(id);
    } catch (error) {
      if (error instanceof VoiceNotConfiguredError) {
        return sendApiError(reply, 503, "VOICE_NOT_CONFIGURED", error.message, false);
      }
      throw error;
    }
    const endpoint = mint.endpoint !== "" ? mint.endpoint : config.voice.endpoint;
    const model = mint.model !== "" ? mint.model : config.voice.model;
    const apiVersion = mint.apiVersion !== "" ? mint.apiVersion : config.voice.apiVersion;
    const voiceName = mint.voiceName !== "" ? mint.voiceName : config.voice.voiceName;
    const expiresAt = mint.expiresAt.toISOString();
    activeVoiceSessions.set(params.data.id, {
      interviewId: params.data.id,
      createdAt: new Date().toISOString(),
      expiresAt,
    });
    request.log.info(
      { interviewId: params.data.id, mode: mint.mode },
      "voice_session.created",
    );
    return reply.status(201).send({
      ok: true,
      session: {
        websocketUrl: buildVoiceWebSocketUrl(endpoint, apiVersion, model),
        endpoint,
        model,
        apiVersion,
        voice: voiceName,
        ttlSeconds: mint.ttlSeconds,
        expiresAt,
        credential: mint.credential,
        credentialMode: mint.mode,
        sessionConfig: FROZEN_VOICE_SESSION_CONFIG,
        instructions: buildSessionInstructions({
          candidateId: state.value.interview.candidateId as string,
          interviewId: params.data.id,
        }),
      },
    });
  });

  app.delete("/api/interviews/:id/voice-session", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const exists = await deps.repos.interviews.findById(asInterviewId(params.data.id));
    if (exists === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Interview ${params.data.id} does not exist`, false);
    }
    activeVoiceSessions.delete(params.data.id);
    request.log.info({ interviewId: params.data.id }, "voice_session.closed");
    return reply.send({ ok: true, active: false });
  });

  return { app, toolIdempotency, activeVoiceSessions };
}

function errorBody(record: { ok: boolean; error: { code: string; message: string } | null }): {
  status: number;
  body: { ok: false; error: { code: string; message: string; retryable: boolean } };
} {
  // Stored failures are permanent domain errors (retryable:false), which is
  // exactly what the browser forwarder must not retry (frozen section 5).
  const code = record.error?.code ?? "INTERNAL_ERROR";
  const message = record.error?.message ?? "Tool execution failed";
  const status = code === "NOT_FOUND" ? 404 : code === "VALIDATION_ERROR" ? 400 : 409;
  return { status, body: { ok: false, error: { code, message, retryable: false } } };
}
