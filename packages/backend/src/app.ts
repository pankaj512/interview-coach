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
//   POST   /api/interviews/:id/pause            (S6.1: expose domain pause)
//   POST   /api/interviews/:id/resume           (S6.1: expose domain resume)
//   POST   /api/interviews/:id/cancel           (S6.1: app-only cancel + reason)
//   POST   /api/interviews/:id/fail             (S6.1: app-only fail + reason)
//   POST   /api/interviews/:id/end
//   POST   /api/interviews/:id/problems         (extension: attach problems)
//   POST   /api/interviews/:id/problems/select  (S5: deterministic auto-select)
//   GET    /api/problems                        (S5: browser + selection)
//   GET    /api/problems/:id
//   POST   /api/interviews/:id/responses        (S5: persist candidate answers)
//   POST   /api/interviews/:id/evaluation       (S5: structured eval pipeline)
//   POST   /api/interviews/:id/submissions      (S7a: submit candidate code)
//   GET    /api/interviews/:id/submissions      (S7a: list submissions)
//   POST   /api/interviews/:id/submissions/:subId/runs (S7a: execute + tests)
//   GET    /api/interviews/:id/runs             (S7a: list runs)
//   GET    /api/interviews/:id/runs/:runId      (S7a: fetch one run)
//   POST   /api/interviews/:id/tool-exec        (call_id idempotency, frozen §5)
//   GET    /api/interviews/:id/tool-results/:call_id (recovery)
//   POST   /api/interviews/:id/voice-session
//   DELETE /api/interviews/:id/voice-session

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  EVALUATION_DIMENSIONS,
  InterviewService,
  SubmissionService,
  ToolService,
  asInterviewId,
  asProblemId,
  asRunId,
  asSubmissionId,
  asUserId,
  finalizeEvaluation,
  selectProblems,
  TOOL_NAMES,
  type CodeExecutor,
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
import {
  serializeEvaluation,
  serializeInterview,
  serializeRun,
  serializeStateSnapshot,
  serializeSubmission,
} from "./serializers.js";
import {
  FROZEN_VOICE_SESSION_CONFIG,
  VoiceNotConfiguredError,
  buildSessionInstructions,
  buildVoiceWebSocketUrl,
  type VoiceSessionProvider,
} from "./voice-session.js";
import { createVoiceSessionProviderFromEnv } from "./voice-session.js";
import { LocalCodeRunner } from "./code-runner.js";

export interface BuildAppDeps {
  readonly repos: RepositorySet;
  readonly config?: BackendConfig;
  readonly voiceProvider?: VoiceSessionProvider;
  readonly codeRunner?: CodeExecutor;
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

// S5: deterministic auto-select (HLD 5.1). All fields optional; missing
// values fall back to the interview's stored configuration.
const selectProblemsSchema = z.object({
  count: z.number().int().min(1).max(20).optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard", "Mixed"]).optional(),
  topicFocus: z.array(z.string().min(1).max(120)).max(20).optional(),
});

const problemsQuerySchema = z.object({
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
  topic: z.string().min(1).max(120).optional(),
  q: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const RESPONSE_KINDS_TUPLE = [
  "answer",
  "approach",
  "code",
  "question",
  "note",
] as const;

// S5: candidate answers persisted outside the model (HLD 5.11).
const recordResponseSchema = z.object({
  kind: z.enum(RESPONSE_KINDS_TUPLE).default("answer"),
  content: z.string().min(1).max(10_000),
  problemId: z.string().min(1).max(200).optional(),
});

const dimensionScoreSchema = z.object({
  score: z.number().int().min(0).max(5),
  notes: z.string().min(1).max(1000).optional(),
});

// S5: structured evaluation pipeline (HLD 5.5). Dimensions are validated
// against the frozen HLD set; overallScore/recommendation are computed when
// omitted (evaluation-pipeline.finalizeEvaluation).
const evaluationSchema = z.object({
  dimensions: z
    .record(z.string(), dimensionScoreSchema)
    .refine(
      (dims) =>
        Object.keys(dims).every((k) =>
          (EVALUATION_DIMENSIONS as readonly string[]).includes(k),
        ),
      { message: `dimensions keys must be within ${EVALUATION_DIMENSIONS.join(", ")}` },
    )
    .optional(),
  hintsUsed: z.number().int().min(0).max(1000).optional(),
  strengths: z.array(z.string().min(1).max(500)).max(20).optional(),
  weaknesses: z.array(z.string().min(1).max(500)).max(20).optional(),
  recommendation: z.enum(["hire", "lean_hire", "lean_no_hire", "no_hire"]).optional(),
  overallScore: z.number().int().min(0).max(100).optional(),
});

// S7a sandbox (HLD 6.1/6.3): candidate code submission + test execution.
// Caps mirror the domain (50k code chars, 50 cases, 100ms..30s timeout).
const submitCodeSchema = z.object({
  language: z.enum(["javascript", "python"]),
  code: z.string().min(1).max(50_000),
  problemId: z.string().min(1).max(200).optional(),
});

const sandboxTestCaseSchema = z.object({
  name: z.string().min(1).max(120),
  args: z.array(z.unknown()),
  expected: z.unknown(),
  hidden: z.boolean().optional(),
});

const runCodeSchema = z.object({
  testCases: z.array(sandboxTestCaseSchema).min(1).max(50),
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
});

const TOOL_NAMES_TUPLE = TOOL_NAMES as unknown as [
  ToolName,
  ...ToolName[],
];

const toolExecSchema = z.object({
  call_id: z.string().min(1).max(200),
  tool: z.enum(TOOL_NAMES_TUPLE),
  arguments: z.record(z.string(), z.unknown()).optional(),
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
  // S7a sandbox: local-dev subprocess runner (HLD Phase 6 MVP). Tests inject
  // a fake via deps.codeRunner; container isolation lands in S8.
  const codeRunner =
    deps.codeRunner ??
    new LocalCodeRunner({ maxActualChars: config.sandbox.maxActualChars });
  const submissions = new SubmissionService({
    interviews,
    submissions: deps.repos.submissions,
    runs: deps.repos.runs,
    events: deps.repos.events,
    executor: codeRunner,
  });
  const tools = new ToolService({
    interviews,
    responses: deps.repos.responses,
    evaluations: deps.repos.evaluations,
    events: deps.repos.events,
    submissions,
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

  // S6.1: optional app-only reason for cancel/fail. Bodyless POSTs arrive
  // with no body (see S4 content-type note), so a missing body means no
  // reason rather than a validation error.
  const lifecycleReasonSchema = z.object({
    reason: z.string().min(1).max(500).optional(),
  });

  function parseLifecycleReason(body: unknown):
    | { ok: true; reason: string | undefined }
    | { ok: false; message: string } {
    if (body === null || body === undefined || body === "") {
      return { ok: true, reason: undefined };
    }
    const parsed = lifecycleReasonSchema.safeParse(body);
    if (!parsed.success) return { ok: false, message: zodMessage(parsed.error) };
    return { ok: true, reason: parsed.data.reason };
  }

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

  // S6.1: expose the remaining domain lifecycle transitions over HTTP.
  // The model never calls these; pause/resume serve reconnect and client
  // flow control, cancel serves explicit user cancellation, fail serves
  // app-side timeout/abuse handling (sandbox timeouts land here in S7).
  app.post("/api/interviews/:id/pause", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const next = await interviews.pause(asInterviewId(params.data.id));
    if (!next.ok) return sendDomainError(reply, next.error);
    request.log.info({ interviewId: next.value.id, to: "paused" }, "interview.lifecycle");
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
  });

  app.post("/api/interviews/:id/resume", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const next = await interviews.resume(asInterviewId(params.data.id));
    if (!next.ok) return sendDomainError(reply, next.error);
    request.log.info({ interviewId: next.value.id, to: "in_progress" }, "interview.lifecycle");
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
  });

  app.post("/api/interviews/:id/cancel", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const reason = parseLifecycleReason(request.body);
    if (!reason.ok) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", reason.message, false);
    }
    const next = await interviews.cancel(asInterviewId(params.data.id), reason.reason);
    if (!next.ok) return sendDomainError(reply, next.error);
    request.log.info({ interviewId: next.value.id, to: "cancelled" }, "interview.lifecycle");
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
  });

  app.post("/api/interviews/:id/fail", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const reason = parseLifecycleReason(request.body);
    if (!reason.ok) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", reason.message, false);
    }
    const next = await interviews.fail(asInterviewId(params.data.id), reason.reason);
    if (!next.ok) return sendDomainError(reply, next.error);
    request.log.info({ interviewId: next.value.id, to: "failed" }, "interview.lifecycle");
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
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

  // S5: problem browser (HLD 5.1). Filtered in memory over the 300-row
  // catalog; stable (difficulty, title) order so pagination is repeatable.
  app.get("/api/problems", async (request, reply) => {
    const parsed = problemsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const all = await deps.repos.problems.list();
    const needle = parsed.data.q?.trim().toLowerCase();
    const topic = parsed.data.topic?.trim().toLowerCase();
    const filtered = all.filter((p) => {
      if (parsed.data.difficulty !== undefined && p.difficulty !== parsed.data.difficulty) {
        return false;
      }
      if (topic !== undefined && topic !== "") {
        const concepts = (p.expectedConcepts ?? []).map((c) => c.toLowerCase());
        if (!concepts.some((c) => c === topic || c.includes(topic) || topic.includes(c))) {
          return false;
        }
      }
      if (needle !== undefined && needle !== "") {
        if (!p.title.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
    const rank = (d: string): number => (d === "Easy" ? 0 : d === "Medium" ? 1 : 2);
    filtered.sort((a, b) => rank(a.difficulty) - rank(b.difficulty) || a.title.localeCompare(b.title));
    const total = filtered.length;
    const problems = filtered.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit);
    return reply.send({
      ok: true,
      problems,
      total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  });

  // S5: deterministic auto-select (HLD 5.1). Resolves the ordered problem
  // set from configuration + catalog, then assigns via the domain service
  // (created/ready only — running interviews keep their set).
  app.post("/api/interviews/:id/problems/select", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = selectProblemsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const id = asInterviewId(params.data.id);
    const interview = await deps.repos.interviews.findById(id);
    if (interview === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Interview ${params.data.id} does not exist`, false);
    }
    const all = await deps.repos.problems.list();
    const topicFocus = parsed.data.topicFocus ?? interview.configuration.topicFocus;
    const selected = selectProblems({
      problems: all,
      difficulty: parsed.data.difficulty ?? interview.configuration.difficulty ?? "Mixed",
      count: parsed.data.count ?? interview.configuration.problemCount ?? 1,
      ...(topicFocus === undefined ? {} : { topicFocus }),
    });
    if (selected.length === 0) {
      return sendApiError(
        reply,
        400,
        "VALIDATION_ERROR",
        "No problems match the requested difficulty/topicFocus",
        false,
      );
    }
    const next = await interviews.assignProblems(
      id,
      selected.map((p) => p.id),
    );
    if (!next.ok) return sendDomainError(reply, next.error);
    request.log.info(
      { interviewId: next.value.id, count: next.value.problems.length, auto: true },
      "problem.assigned",
    );
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
  });

  // S5: persist candidate answers (HLD 5.11). Used by the UI and the
  // record_candidate_answer tool path alike; evaluation reads these.
  app.post("/api/interviews/:id/responses", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = recordResponseSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const id = asInterviewId(params.data.id);
    const recorded = await interviews.recordResponse(id, {
      kind: parsed.data.kind,
      content: parsed.data.content,
      ...(parsed.data.problemId === undefined
        ? {}
        : { problemId: asProblemId(parsed.data.problemId) }),
    });
    if (!recorded.ok) return sendDomainError(reply, recorded.error);
    const responses = await deps.repos.responses.listByInterview(id);
    request.log.info(
      { interviewId: params.data.id, kind: parsed.data.kind },
      "response.recorded",
    );
    return reply.status(201).send({
      ok: true,
      interview: serializeInterview(recorded.value),
      responseCount: responses.length,
    });
  });

  // S5: structured evaluation pipeline (HLD 5.5/5.8). Computes overallScore
  // and derives recommendation when omitted; explicit values are kept.
  // Allowed while running, completing, or completed (post-interview).
  app.post("/api/interviews/:id/evaluation", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = evaluationSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const id = asInterviewId(params.data.id);
    const existing = await deps.repos.interviews.findById(id);
    if (existing === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Interview ${params.data.id} does not exist`, false);
    }
    const finalized = finalizeEvaluation({
      ...(parsed.data.dimensions === undefined ? {} : { dimensions: parsed.data.dimensions }),
      ...(parsed.data.hintsUsed === undefined ? {} : { hintsUsed: parsed.data.hintsUsed }),
      ...(parsed.data.strengths === undefined ? {} : { strengths: parsed.data.strengths }),
      ...(parsed.data.weaknesses === undefined ? {} : { weaknesses: parsed.data.weaknesses }),
      ...(parsed.data.recommendation === undefined
        ? {}
        : { recommendation: parsed.data.recommendation }),
      ...(parsed.data.overallScore === undefined ? {} : { overallScore: parsed.data.overallScore }),
    });
    // Preserve accumulated hintsUsed when the caller omits it: the stored
    // evaluation (hint accounting) wins over the default 0.
    let hintsUsed = finalized.hintsUsed;
    if (parsed.data.hintsUsed === undefined) {
      const stored = await deps.repos.evaluations.findByInterview(id);
      if (stored !== null && stored.hintsUsed > hintsUsed) hintsUsed = stored.hintsUsed;
    }
    const recorded = await interviews.recordEvaluation(id, {
      dimensions: finalized.dimensions,
      hintsUsed,
      strengths: [...finalized.strengths],
      weaknesses: [...finalized.weaknesses],
      ...(finalized.overallScore === null ? {} : { overallScore: finalized.overallScore }),
      ...(finalized.recommendation === null ? {} : { recommendation: finalized.recommendation }),
    });
    if (!recorded.ok) return sendDomainError(reply, recorded.error);
    request.log.info({ interviewId: params.data.id }, "evaluation.recorded");
    return reply.status(201).send({ ok: true, evaluation: serializeEvaluation(recorded.value) });
  });

  // S7a sandbox routes (HLD 6.1–6.3). Submissions are backend-owned state;
  // runs execute in the local-dev runner with a wall-clock kill. Timeout and
  // harness failures persist as `timeout`/`error` runs (201 with a status
  // field), never 5xx — the model and UI react to the verdict.
  app.post("/api/interviews/:id/submissions", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = submitCodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const id = asInterviewId(params.data.id);
    const submitted = await submissions.submit(id, {
      language: parsed.data.language,
      code: parsed.data.code,
      ...(parsed.data.problemId === undefined
        ? {}
        : { problemId: parsed.data.problemId }),
    });
    if (!submitted.ok) return sendDomainError(reply, submitted.error);
    request.log.info(
      { interviewId: params.data.id, submissionId: submitted.value.id },
      "code.submitted",
    );
    return reply
      .status(201)
      .send({ ok: true, submission: serializeSubmission(submitted.value) });
  });

  app.get("/api/interviews/:id/submissions", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const listed = await submissions.listSubmissions(asInterviewId(params.data.id));
    if (!listed.ok) return sendDomainError(reply, listed.error);
    return reply.send({
      ok: true,
      submissions: listed.value.map(serializeSubmission),
    });
  });

  app.post(
    "/api/interviews/:id/submissions/:subId/runs",
    async (request, reply) => {
      const params = z
        .object({
          id: z.string().min(1).max(200),
          subId: z.string().min(1).max(200),
        })
        .safeParse(request.params);
      if (!params.success) {
        return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
      }
      const parsed = runCodeSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
      }
      const id = asInterviewId(params.data.id);
      const submissionId = asSubmissionId(params.data.subId);
      const submission = await deps.repos.submissions.findById(submissionId);
      if (submission === null || submission.interviewId !== id) {
        return sendApiError(
          reply,
          404,
          "NOT_FOUND",
          `Submission ${params.data.subId} does not exist for interview ${params.data.id}`,
          false,
        );
      }
      const run = await submissions.runTests(
        submissionId,
        parsed.data.testCases.map((t) => ({
          name: t.name,
          args: t.args,
          expected: t.expected,
          ...(t.hidden === undefined ? {} : { hidden: t.hidden }),
        })),
        parsed.data.timeoutMs,
      );
      if (!run.ok) return sendDomainError(reply, run.error);
      request.log.info(
        {
          interviewId: params.data.id,
          submissionId: params.data.subId,
          runId: run.value.id,
          status: run.value.status,
          durationMs: run.value.durationMs,
        },
        "code.executed",
      );
      return reply
        .status(201)
        .send({ ok: true, run: serializeRun(run.value) });
    },
  );

  app.get("/api/interviews/:id/runs", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const listed = await submissions.listRuns(asInterviewId(params.data.id));
    if (!listed.ok) return sendDomainError(reply, listed.error);
    return reply.send({ ok: true, runs: listed.value.map(serializeRun) });
  });

  app.get("/api/interviews/:id/runs/:runId", async (request, reply) => {
    const params = z
      .object({
        id: z.string().min(1).max(200),
        runId: z.string().min(1).max(200),
      })
      .safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const id = asInterviewId(params.data.id);
    const run = await deps.repos.runs.findById(asRunId(params.data.runId));
    if (run === null || run.interviewId !== id) {
      return sendApiError(
        reply,
        404,
        "NOT_FOUND",
        `Run ${params.data.runId} does not exist for interview ${params.data.id}`,
        false,
      );
    }
    return reply.send({ ok: true, run: serializeRun(run) });
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
    const toolArgs = parsed.data.arguments as Record<string, unknown> | undefined;
    request.log.info({ interviewId: interviewId as string, callId, tool }, "tool.received");
    const startedAt = Date.now();
    let outcome;
    try {
      outcome = await toolIdempotency.execute(callId, interviewId as string, tool, async () => {
        const result = await tools.dispatch(tool, { interviewId, callId }, toolArgs);
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
    // S7a sandbox summary (HLD 6.4): code progress travels with the mint so
    // the model starts aware of submissions and latest run verdicts.
    const submissionCount = await submissions.submissionCount(id);
    const latestRun = await submissions.latestSummary(id);
    const sandboxSummary =
      submissionCount === 0
        ? "no code submitted yet"
        : latestRun.ok && latestRun.value !== null
          ? `${submissionCount} submission${submissionCount === 1 ? "" : "s"}, latest run ${latestRun.value.status} (${latestRun.value.passedCount}/${latestRun.value.totalCount})`
          : `${submissionCount} submission${submissionCount === 1 ? "" : "s"}, not run yet`;
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
        // S5 structured context (HLD 5.2): configuration + current problem
        // + progress travel with the mint so the model starts grounded.
        instructions: buildSessionInstructions({
          candidateId: state.value.interview.candidateId as string,
          interviewId: params.data.id,
          configurationSummary: describeConfiguration(state.value.interview.configuration),
          ...(state.value.currentProblem === null
            ? {}
            : { problemSummary: describeProblem(state.value.currentProblem) }),
          responseCount: state.value.responseCount,
          hintsUsed: state.value.evaluation?.hintsUsed ?? 0,
          sandboxSummary,
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

function describeConfiguration(config: InterviewConfiguration): string {
  const parts = [`type=${config.interviewType}`];
  if (config.difficulty !== undefined) parts.push(`difficulty=${config.difficulty}`);
  if (config.durationMinutes !== undefined) parts.push(`duration=${config.durationMinutes}min`);
  if (config.problemCount !== undefined) parts.push(`problems=${config.problemCount}`);
  if (config.topicFocus !== undefined && config.topicFocus.length > 0) {
    parts.push(`topics=${config.topicFocus.join(", ")}`);
  }
  return parts.join("; ");
}

function describeProblem(problem: {
  title: string;
  difficulty: string;
  expectedConcepts?: readonly string[];
}): string {
  const concepts =
    problem.expectedConcepts !== undefined && problem.expectedConcepts.length > 0
      ? ` — ${problem.expectedConcepts.join(", ")}`
      : "";
  return `${problem.title} (${problem.difficulty})${concepts}`;
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
