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
//   GET    /api/ready                             (S8a probe)
//   GET    /api/metrics                           (S8a observability)
//   GET    /api/metrics/prometheus                (S8b scrape target)
//   POST   /api/auth/register                     (S8c self-service signup)
//   POST   /api/auth/login                        (S8c credential login)
//   POST   /api/auth/logout                       (S8c session revoke)
//   GET    /api/profile                           (Phase 2: read own profile)
//   PUT    /api/profile                           (Phase 2: create/edit profile)
//   GET    /api/curriculum                        (Phase 3: server-owned curriculum)
//   GET    /api/curriculum/topics/:id             (Phase 3: topic + problems)
//   GET    /api/skills                            (Phase 3: own skill state)
//   GET    /api/recommendations/current           (Phase 4: current proposal)
//   POST   /api/recommendations                   (Phase 4: generate + persist)
//   POST   /api/recommendations/:id/accept        (Phase 4: accept proposal)
//   POST   /api/interviews
//   GET    /api/interviews/:id
//   GET    /api/interviews/:id/state
//   POST   /api/interviews/:id/ready            (extension: lifecycle needs it)
//   POST   /api/interviews/:id/start
//   POST   /api/interviews/:id/pause            (S6.1: expose domain pause)
//   POST   /api/interviews/:id/resume           (S6.1: expose domain resume)
//   POST   /api/interviews/:id/cancel           (S6.1: app-only cancel + reason)
//   POST   /api/interviews/:id/fail             (S6.1: app-only fail + reason)
//   DELETE /api/interviews/:id                  (S8b: hard erase, retention)
//   POST   /api/interviews/:id/end
//   POST   /api/interviews/:id/problems         (extension: attach problems)
//   POST   /api/interviews/:id/problems/select  (S5: deterministic auto-select)
//   GET    /api/problems                        (S5: browser + selection)
//   GET    /api/problems/:id
//   GET    /api/problems/:id/content       (18c: problem content slice)
//   POST   /api/interviews/:id/responses        (S5: persist candidate answers)
//   GET    /api/interviews/:id/evaluation       (Phase 10: async evaluation result)
//   GET    /api/interviews                      (Phase 9: user history list)
//   POST   /api/interviews/:id/transcript       (Phase 9: append transcript)
//   GET    /api/interviews/:id/transcript       (Phase 9: read transcript)
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
import helmet from "@fastify/helmet";
import { z } from "zod";
import {
  InterviewService,
  SubmissionService,
  ToolService,
  asInterviewId,
  asProblemId,
  asRecommendationId,
  asRunId,
  asSubmissionId,
  asTopicId,
  asUserId,
  selectProblems,
  TOOL_NAMES,
  validateSubmitVerdictInput,
  validateSubmitVerdictProposal,
  type CodeExecutor,
  type EvaluationModel,
  type InterviewConfiguration,
  type InterviewId,
  type Problem,
  type RecommendationId,
  type RecommendationModel,
  type RepositorySet,
  type SubmitVerdict,
  type SubmitVerdictModel,
  type SubmitVerdictProblem,
  type ToolName,
  type ToolResult,
  type TopicId,
} from "@interview-coach/domain";
import { loadConfig, type BackendConfig } from "./config.js";
import { extractBearerToken, registerAuthHook, registerOwnershipHook } from "./auth.js";
import { BackendMetrics } from "./metrics.js";
import { renderPrometheusMetrics } from "./prometheus.js";
import { UserService, type AuthenticatedSession } from "./users.js";
import { ProfileService } from "./profile.js";
import { CurriculumService } from "./curriculum.js";
import { SkillService } from "./skills.js";
import { SkillUpdateService } from "./skill-update.js";
import { RecommendationService } from "./recommendation.js";
import { createRecommendationModelFromEnv } from "./recommendation-model.js";
import { bucketForRoute, FixedWindowRateLimiter, type RateBudget } from "./rate-limit.js";
import {
  CallIdConflictError,
  CallIdToolMismatchError,
  IdempotencyStore,
} from "./idempotency.js";
import { sendApiError, sendDomainError } from "./http-errors.js";
import {
  serializeEvaluation,
  serializeCurriculum,
  serializeInterview,
  serializeInterviewMessage,
  serializeInterviewSummary,
  serializeProblemContent,
  serializeRecommendation,
  serializeRun,
  serializeStateSnapshot,
  serializeSubmission,
  serializeSubmitVerdict,
  serializeUserCurriculumProgress,
  serializeUserProfile,
  serializeUserSkillState,
} from "./serializers.js";
import {
  FROZEN_VOICE_SESSION_CONFIG,
  VoiceNotConfiguredError,
  buildSessionInstructions,
  buildVoiceWebSocketUrl,
  type VoiceSessionProvider,
} from "./voice-session.js";
import { createVoiceSessionProviderFromEnv } from "./voice-session.js";
import { assembleSessionContext, type SessionContext } from "./session-context.js";
import { EvaluationService } from "./evaluation.js";
import { createEvaluationModelFromEnv } from "./evaluation-model.js";
import { createSubmitVerdictModelFromEnv, UnconfiguredSubmitVerdictModel } from "./submit-verdict-model.js";
import { DockerCodeRunner } from "./docker-runner.js";

export interface BuildAppDeps {
  readonly repos: RepositorySet;
  readonly config?: BackendConfig;
  readonly voiceProvider?: VoiceSessionProvider;
  readonly codeRunner?: CodeExecutor;
  /** Phase 4: injectable so tests use a deterministic fake, never a live LLM. */
  readonly recommendationModel?: RecommendationModel;
  /** Phase 10: injectable so tests use a deterministic fake, never a live LLM. */
  readonly evaluationModel?: EvaluationModel;

  readonly submitVerdictModel?: SubmitVerdictModel;
  /** Phase 10: tests set true so `end` runs the evaluation synchronously. */
  readonly evaluationRunSynchronously?: boolean;
  readonly logger?: boolean;
}

export interface BuiltBackend {
  readonly app: FastifyInstance;
  readonly toolIdempotency: IdempotencyStore<ToolResult>;
  readonly activeVoiceSessions: Map<string, ActiveVoiceSession>;
  readonly metrics: BackendMetrics;
}

export interface ActiveVoiceSession {
  readonly interviewId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

const VERSION = "0.1.0";

const configurationSchema = z.object({
  interviewType: z.literal("dsa"),
  difficulty: z.enum(["Easy", "Medium", "Hard", "Mixed"]).optional(),
  durationMinutes: z.number().int().positive().max(480).optional(),
  problemCount: z.number().int().positive().max(20).optional(),
  topicFocus: z.array(z.string().min(1).max(120)).max(20).optional(),
});

const createInterviewSchema = z.object({
  candidateId: z.string().min(1).max(200),
  configuration: configurationSchema,
  // Phase 9: bind the session to the recommendation it was started from and
  // the targeted curriculum topic. Validated against the caller below.
  recommendationId: z.string().min(1).max(200).optional(),
  topicId: z.string().min(1).max(200).optional(),
});

// S8c credential endpoints (HLD 7.1). Fine-grained rules (password length,
// email shape, duplicate detection) live in UserService; zod guards shape.
const registerSchema = z.object({
  email: z.string().min(1).max(254),
  displayName: z.string().min(1).max(120),
  password: z.string().min(1).max(128),
});

const loginSchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

// Phase 2: profile upsert body. Domain re-validates role/level/interviewTypes
// against the taxonomy; zod guards shape + sizes.
const profileSchema = z.object({
  interviewTypes: z.array(z.string().min(1).max(50)).min(1).max(10),
  role: z.string().min(1).max(80),
  level: z.string().min(1).max(40),
  goals: z.string().max(500).optional(),
});

// Phase 3: optional curriculum filter (v1 has one curriculum per interview type).
const curriculumQuerySchema = z.object({
  interviewType: z.enum(["dsa"]).optional(),
});

function serializeSession(session: AuthenticatedSession): {
  user: { id: string; email: string; displayName: string; createdAt: string };
  session: { token: string; expiresAt: string };
} {
  return {
    user: {
      id: session.id as string,
      email: session.email,
      displayName: session.displayName,
      createdAt: session.createdAt.toISOString(),
    },
    session: { token: session.token, expiresAt: session.expiresAt.toISOString() },
  };
}

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

// Phase 9: structured transcript append (browser forwards Voice Live turns).
const transcriptSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["candidate", "interviewer", "system"]),
        content: z.string().min(1).max(10_000),
        problemId: z.string().min(1).max(200).optional(),
      }),
    )
    .min(1)
    .max(100),
});

// Phase 9: server-backed history listing.
const listInterviewsQuerySchema = z.object({
  candidateId: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// S7a sandbox (HLD 6.1/6.3): candidate code submission + test execution.
// Caps mirror the domain (50k code chars, 50 cases, 100ms..30s timeout).
const submitCodeSchema = z.object({
  language: z.enum(["javascript", "python", "cpp"]),
  code: z.string().min(1).max(50_000),
  problemId: z.string().min(1).max(200).optional(),
});

// Feature 18d: map a catalog problem onto the verdict contract. Returns
// null when the problem lacks a usable statement or constraints, so the
// model judges code alone instead of receiving a half-empty problem.
function toVerdictProblem(problem: Problem): SubmitVerdictProblem | null {
  const statement = problem.description?.trim() ?? "";
  const constraints = (problem.constraints ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (statement === "" || constraints.length === 0) return null;
  return {
    id: problem.id,
    title: problem.title,
    statement,
    constraints: constraints.join("\n"),
  };
}

const sandboxTestCaseSchema = z.object({  name: z.string().min(1).max(120),
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

// F6-3: a transient quota/capacity result from a tool dispatch. Thrown (not
// returned) so the idempotency store does not cache it as a permanent result;
// the tool-exec route maps it to 429 retryable:true so the forwarder backs off.
class RateLimitedToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedToolError";
  }
}

export function buildApp(deps: BuildAppDeps): BuiltBackend {
  const config = deps.config ?? loadConfig();
  const voiceProvider = deps.voiceProvider ?? createVoiceSessionProviderFromEnv();
  // S8a: explicit body cap (code 50k + cases fit comfortably); oversized
  // payloads 413 via the error handler instead of consuming the runner.
  const app = Fastify({ logger: deps.logger ?? true, bodyLimit: 256 * 1024, forceCloseConnections: true });
  const toolIdempotency = new IdempotencyStore<ToolResult>({
    ttlMs: config.tools.idempotencyTtlMs,
    maxEntries: config.tools.idempotencyMaxEntries,
  });
  const activeVoiceSessions = new Map<string, ActiveVoiceSession>();
  // V3-1: the media plane is browser<->Voice Live, so the backend receives no
  // disconnect signal. Expired mints are swept lazily (voice/quota/ready
  // paths) and by a janitor timer, so an abandoned tab cannot leak a slot
  // until the map is exhausted.
  const sweepExpiredVoiceSessions = (now: number = Date.now()): number => {
    let removed = 0;
    for (const [key, session] of activeVoiceSessions) {
      if (Date.parse(session.expiresAt) <= now) {
        activeVoiceSessions.delete(key);
        removed += 1;
      }
    }
    return removed;
  };
  const voiceSweepTimer = setInterval(() => sweepExpiredVoiceSessions(), 60_000);
  if (typeof voiceSweepTimer === "object" && "unref" in voiceSweepTimer) {
    (voiceSweepTimer as unknown as { unref(): void }).unref();
  }
  app.addHook("onClose", () => {
    clearInterval(voiceSweepTimer);
  });
  // S8a observability (HLD 8.4): in-memory counters, reset on restart.
  const metrics = new BackendMetrics();

  const interviews = new InterviewService({ ...deps.repos });
  // S8c accounts (HLD 7.1): self-registered local credentials. Social
  // sign-in (S8d) mints the same session rows via a second issuer.
  const users = new UserService({
    users: deps.repos.users,
    sessions: deps.repos.sessions,
    sessionTtlMs: config.auth.sessionTtlMs,
  });
  // Phase 2: server-owned profile (starting context for the learning loop).
  const profiles = new ProfileService({ profiles: deps.repos.profiles });
  // Phase 3: server-owned curriculum + per-user skill state.
  const curricula = new CurriculumService({ curricula: deps.repos.curricula });
  const skills = new SkillService({
    skillStates: deps.repos.skillStates,
    curriculumProgress: deps.repos.curriculumProgress,
  });
  // Phase 11: deterministic mastery/curriculum update after an evaluation.
  const skillUpdates = new SkillUpdateService({
    skillStates: deps.repos.skillStates,
    curriculumProgress: deps.repos.curriculumProgress,
    curricula,
  });
  // Phase 4: recommendation service over a server-side LLM port. Unconfigured
  // in local dev by default, so the deterministic fallback drives the loop.
  const recommendationModel =
    deps.recommendationModel ?? createRecommendationModelFromEnv(config.llm);
  const recommendations = new RecommendationService({
    recommendations: deps.repos.recommendations,
    curricula: deps.repos.curricula,
    problems: deps.repos.problems,
    skillStates: deps.repos.skillStates,
    curriculumProgress: deps.repos.curriculumProgress,
    profiles: deps.repos.profiles,
    model: recommendationModel,
  });
  // Phase 10: async evaluation over a server-side LLM port. Unconfigured in
  // local dev by default, so the deterministic fallback scores the interview.
  const evaluationModel =
    deps.evaluationModel ?? createEvaluationModelFromEnv(config.llm);
  const evaluationService = new EvaluationService({
    repos: deps.repos,
    interviews,
    curricula,
    profiles,
    skills,
    skillUpdates,
    recommendations,
    model: evaluationModel,
    metrics,
    ...(deps.evaluationRunSynchronously === undefined
      ? {}
      : { runSynchronously: deps.evaluationRunSynchronously }),
  });
  // Feature 18d: AI-only Submit verdict over the same server-side LLM port.
  // No sandbox run, zero persistence — the verdict is computed and returned.
  const submitVerdictModel =
    deps.submitVerdictModel ?? createSubmitVerdictModelFromEnv(config.llm);
  // Feature 16 sandbox: Docker-isolated runner (HLD Phase 6). Tests inject
  // a fake via deps.codeRunner; without a daemon, runs persist as errors.
  const codeRunner =
    deps.codeRunner ??
    new DockerCodeRunner({
      images: config.sandbox.runnerImages,
      memory: config.sandbox.runnerMemory,
      cpus: config.sandbox.runnerCpus,
      pidsLimit: config.sandbox.runnerPidsLimit,
      maxActualChars: config.sandbox.maxActualChars,
    });
  const submissions = new SubmissionService({
    interviews,
    submissions: deps.repos.submissions,
    runs: deps.repos.runs,
    events: deps.repos.events,
    executor: codeRunner,
    // F6-3: quotas enforced in the service so the model tool path cannot
    // bypass the HTTP route limits.
    maxConcurrentRuns: config.sandbox.maxConcurrentRuns,
    maxSubmissionsPerInterview: config.sandbox.maxSubmissionsPerInterview,
  });
  const tools = new ToolService({
    interviews,
    responses: deps.repos.responses,
    evaluations: deps.repos.evaluations,
    events: deps.repos.events,
    submissions,
  });

  void app.register(cors, { origin: config.corsOrigin });
  // S8a: security headers (nosniff/frameguard/hsts), owned fixed-window rate
  // limits (global + tighter budgets on tool-exec/voice-mint/code-run), then
  // the service auth gate. Limiting runs before auth so token brute-forcing
  // is throttled too.
  void app.register(helmet);
  const limiter = new FixedWindowRateLimiter();
  const budgets: Record<Exclude<ReturnType<typeof bucketForRoute>, "exempt">, RateBudget> = {
    global: { max: config.rateLimits.globalPerMin, windowMs: 60_000 },
    toolExec: { max: config.rateLimits.toolExecPerMin, windowMs: 60_000 },
    voiceMint: { max: config.rateLimits.voiceMintPerMin, windowMs: 60_000 },
    codeRun: { max: config.rateLimits.codeRunPerMin, windowMs: 60_000 },
    auth: { max: config.rateLimits.authPerMin, windowMs: 60_000 },
    recommendation: { max: config.rateLimits.recommendationPerMin, windowMs: 60_000 },
  };
  app.addHook("onRequest", (request, reply, done) => {
    const pathname = request.url.split("?", 1)[0] ?? "/";
    const bucket = bucketForRoute(request.method, pathname);
    if (bucket === "exempt") {
      done();
      return;
    }
    const verdict = limiter.check(bucket, request.ip, budgets[bucket]);
    if (!verdict.allowed) {
      reply.header("retry-after", String(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000))));
      sendApiError(reply, 429, "RATE_LIMITED", "Rate limit exceeded, retry shortly", true);
      return;
    }
    done();
  });
  // S8c: the gate resolves service vs user callers; ownership scopes user
  // callers to their own interviews (HLD 7.2).
  registerAuthHook(app, {
    authToken: config.authToken,
    resolveUser: async (token) => {
      const account = await users.resolveSession(token);
      if (account === null) return null;
      return { userId: account.id, displayName: account.displayName };
    },
  });
  registerOwnershipHook(app, deps.repos);

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
    limiter.close();
    toolIdempotency.close();
    done();
  });

  app.get("/api/health", (_request, reply) => {
    reply.send({ ok: true, service: "interview-coach-backend", version: VERSION });
  });

  // S8a probes: readiness exercises the repo layer (Postgres SELECT on Drizzle,
  // memory scan on in-memory) so a dead DB reads unready; metrics is the
  // auth-gated operational snapshot (HLD 8.4). Both are cheap by design.
  app.get("/api/ready", async (_request, reply) => {
    try {
      await deps.repos.problems.list();
    } catch {
      return reply
        .status(503)
        .send({ ok: false, error: { code: "NOT_READY", message: "Repository unreachable", retryable: true } });
    }
    sweepExpiredVoiceSessions();
    return reply.send({
      ok: true,
      ready: true,
      service: "interview-coach-backend",
      version: VERSION,
      voiceMode: voiceProvider.mode,
      activeVoiceSessions: activeVoiceSessions.size,
    });
  });

  app.get("/api/metrics", (_request, reply) => {
    sweepExpiredVoiceSessions();
    return reply.send({
      ok: true,
      metrics: metrics.snapshot(activeVoiceSessions.size, toolIdempotency.size),
    });
  });

  // S8b: Prometheus scrape target (HLD 8.4) over the same snapshot.
  // Auth-gated by the same hook (it lives under /api/).
  app.get("/api/metrics/prometheus", (_request, reply) => {
    sweepExpiredVoiceSessions();
    return reply
      .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .send(renderPrometheusMetrics(metrics.snapshot(activeVoiceSessions.size, toolIdempotency.size)));
  });

  // S8c accounts (HLD 7.1): self-service registration + credential login.
  // Register/login stay reachable without a bearer (that is their purpose);
  // logout needs one. The raw session token is shown once here and never
  // stored or logged.
  app.post("/api/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const registered = await users.register({
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
    });
    if (!registered.ok) {
      if (registered.error.code === "CONFLICT") metrics.countAuthFailure();
      return sendDomainError(reply, registered.error);
    }
    request.log.info({ userId: registered.value.id }, "auth.registered");
    metrics.countAuthRegistered();
    return reply.status(201).send({ ok: true, ...serializeSession(registered.value) });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const session = await users.login(parsed.data.email, parsed.data.password);
    if (session === null) {
      metrics.countAuthFailure();
      return sendApiError(reply, 401, "INVALID_CREDENTIALS", "Unknown email or wrong password", false);
    }
    request.log.info({ userId: session.id }, "auth.login");
    metrics.countAuthLogin();
    return reply.send({ ok: true, ...serializeSession(session) });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = extractBearerToken(request);
    if (token === null) {
      return sendApiError(reply, 401, "UNAUTHORIZED", "Missing or invalid bearer token", false);
    }
    const revoked = await users.logout(token);
    if (!revoked) {
      return sendApiError(reply, 401, "UNAUTHORIZED", "Missing or invalid bearer token", false);
    }
    return reply.send({ ok: true, revoked: true });
  });

  // Phase 2 profile (HLD learning loop): user-only surface — the owner is the
  // authenticated session, never a body field. Anonymous local-dev and service
  // callers have no user id, so both get 401. GET returns profile:null for a
  // signed-in user who has not onboarded yet (drives the first-run gate).
  app.get("/api/profile", async (request, reply) => {
    const caller = request.caller;
    if (caller === undefined || caller.kind !== "user") {
      return sendApiError(reply, 401, "UNAUTHORIZED", "Sign in to access your profile", false);
    }
    const profile = await profiles.get(caller.userId);
    return reply.send({
      ok: true,
      profile: profile === null ? null : serializeUserProfile(profile),
    });
  });

  app.put("/api/profile", async (request, reply) => {
    const caller = request.caller;
    if (caller === undefined || caller.kind !== "user") {
      return sendApiError(reply, 401, "UNAUTHORIZED", "Sign in to access your profile", false);
    }
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const saved = await profiles.upsert(caller.userId, parsed.data);
    if (!saved.ok) return sendDomainError(reply, saved.error);
    request.log.info({ userId: caller.userId }, "profile.updated");
    metrics.countProfileUpdated();
    return reply.send({ ok: true, profile: serializeUserProfile(saved.value) });
  });

  // Phase 3 curriculum (HLD learning loop): server-owned static config. Any
  // authenticated caller may read it; it is never user-scoped.
  app.get("/api/curriculum", async (request, reply) => {
    const parsed = curriculumQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const list = await curricula.list(parsed.data.interviewType);
    return reply.send({ ok: true, curricula: list.map(serializeCurriculum) });
  });

  app.get("/api/curriculum/topics/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const lookup = await curricula.findTopic(asTopicId(params.data.id));
    if (lookup === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Topic ${params.data.id} does not exist`, false);
    }
    const problems = await deps.repos.problems.findManyByIds(lookup.topic.problemIds);
    return reply.send({
      ok: true,
      curriculumId: lookup.curriculum.id,
      topic: serializeCurriculum(lookup.curriculum).topics.find(
        (topic) => topic.id === lookup.topic.id,
      ),
      problems,
    });
  });

  // Phase 3 skills: per-user mastery + curriculum pointer. User-only, like the
  // profile: the owner comes from the session, never the body.
  app.get("/api/skills", async (request, reply) => {
    const caller = request.caller;
    if (caller === undefined || caller.kind !== "user") {
      return sendApiError(reply, 401, "UNAUTHORIZED", "Sign in to access your skills", false);
    }
    const snapshot = await skills.getSnapshot(caller.userId);
    return reply.send({
      ok: true,
      skills: snapshot.skills.map(serializeUserSkillState),
      progress:
        snapshot.progress === null
          ? null
          : serializeUserCurriculumProgress(snapshot.progress),
    });
  });

  // Phase 4 recommendation (HLD learning loop): user-only, like profile/skills.
  // GET current returns the latest non-superseded proposal, or null before one
  // has been generated. Generation is synchronous (ADR-002) and always yields
  // a result — the LLM picks from a backend-built candidate set, and an
  // unavailable/invalid model falls back deterministically.
  app.get("/api/recommendations/current", async (request, reply) => {
    const caller = request.caller;
    if (caller === undefined || caller.kind !== "user") {
      return sendApiError(reply, 401, "UNAUTHORIZED", "Sign in to access recommendations", false);
    }
    const current = await recommendations.current(caller.userId);
    return reply.send({
      ok: true,
      recommendation: current === null ? null : serializeRecommendation(current),
    });
  });

  app.post("/api/recommendations", async (request, reply) => {
    const caller = request.caller;
    if (caller === undefined || caller.kind !== "user") {
      return sendApiError(reply, 401, "UNAUTHORIZED", "Sign in to access recommendations", false);
    }
    const generated = await recommendations.generate(caller.userId);
    if (!generated.ok) return sendDomainError(reply, generated.error);
    const { recommendation, source } = generated.value;
    request.log.info(
      {
        userId: caller.userId,
        recommendationId: recommendation.id,
        source,
        ...(generated.value.modelError === undefined
          ? {}
          : { modelError: generated.value.modelError }),
      },
      "recommendation.generated",
    );
    metrics.countRecommendationGenerated(source);
    return reply.status(201).send({
      ok: true,
      recommendation: serializeRecommendation(recommendation),
      source,
    });
  });

  app.post("/api/recommendations/:id/accept", async (request, reply) => {
    const caller = request.caller;
    if (caller === undefined || caller.kind !== "user") {
      return sendApiError(reply, 401, "UNAUTHORIZED", "Sign in to access recommendations", false);
    }
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const accepted = await recommendations.accept(
      caller.userId,
      asRecommendationId(params.data.id),
    );
    if (!accepted.ok) return sendDomainError(reply, accepted.error);
    request.log.info(
      { userId: caller.userId, recommendationId: params.data.id },
      "recommendation.accepted",
    );
    metrics.countRecommendationAccepted();
    return reply.send({ ok: true, recommendation: serializeRecommendation(accepted.value) });
  });

  app.post("/api/interviews", async (request, reply) => {
    const parsed = createInterviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    // S8c: a user-authenticated caller always owns the interview they
    // create — identity comes from the session, the body value is ignored.
    // Anonymous (open local-dev) and service (CLI/admin) callers keep the
    // client-supplied candidateId.
    const caller = request.caller;
    const candidateId =
      caller !== undefined && caller.kind === "user"
        ? caller.userId
        : asUserId(parsed.data.candidateId);
    // Phase 9: a user caller may bind the session to a recommendation they own
    // (foreign/unknown ids read as 404, no ownership oracle). The topic is
    // taken from the recommendation unless the caller supplies one.
    let recommendationId: RecommendationId | undefined;
    let topicId: TopicId | undefined;
    if (parsed.data.recommendationId !== undefined) {
      const recommendation = await deps.repos.recommendations.findById(
        asRecommendationId(parsed.data.recommendationId),
      );
      if (
        recommendation === null ||
        (caller !== undefined &&
          caller.kind === "user" &&
          recommendation.userId !== caller.userId)
      ) {
        return sendApiError(
          reply,
          404,
          "NOT_FOUND",
          `Recommendation ${parsed.data.recommendationId} does not exist`,
          false,
        );
      }
      recommendationId = recommendation.id;
      topicId = asTopicId(recommendation.topicId);
    }
    if (parsed.data.topicId !== undefined) {
      topicId = asTopicId(parsed.data.topicId);
    }
    const created = await interviews.createInterview({
      candidateId,
      configuration: toDomainConfiguration(parsed.data.configuration),
      ...(recommendationId === undefined ? {} : { recommendationId }),
      ...(topicId === undefined ? {} : { topicId }),
    });
    if (!created.ok) return sendDomainError(reply, created.error);
    request.log.info({ interviewId: created.value.id }, "interview.created");
    metrics.countInterviewCreated();
    return reply.status(201).send({ ok: true, interview: serializeInterview(created.value) });
  });

  // Phase 9: server-backed history. User callers list their own interviews;
  // service/anonymous callers must name a candidateId (open local-dev + CLI).
  app.get("/api/interviews", async (request, reply) => {
    const parsed = listInterviewsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const caller = request.caller;
    const candidateId =
      caller !== undefined && caller.kind === "user"
        ? caller.userId
        : parsed.data.candidateId === undefined
          ? undefined
          : asUserId(parsed.data.candidateId);
    if (candidateId === undefined) {
      return sendApiError(
        reply,
        400,
        "VALIDATION_ERROR",
        "candidateId is required for service/anonymous callers",
        false,
      );
    }
    const list = await interviews.listInterviews(candidateId, parsed.data.limit);
    const evaluations = await deps.repos.evaluations.listByInterviewIds(
      list.map((interview) => interview.id),
    );
    const byInterview = new Map(evaluations.map((evaluation) => [evaluation.interviewId, evaluation]));
    return reply.send({
      ok: true,
      interviews: list.map((interview) =>
        serializeInterviewSummary(interview, byInterview.get(interview.id) ?? null),
      ),
    });
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

  // Phase 9: structured transcript. The browser forwards Voice Live turns; the
  // backend validates and persists them (roadmap locked decision 6). Ownership
  // is enforced by the preHandler hook for user callers.
  app.post("/api/interviews/:id/transcript", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = transcriptSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const appended = await interviews.appendMessages(
      asInterviewId(params.data.id),
      parsed.data.messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.problemId === undefined
          ? {}
          : { problemId: asProblemId(message.problemId) }),
      })),
    );
    if (!appended.ok) return sendDomainError(reply, appended.error);
    request.log.info(
      { interviewId: params.data.id, count: appended.value.length },
      "transcript.appended",
    );
    return reply.status(201).send({
      ok: true,
      messages: appended.value.map(serializeInterviewMessage),
    });
  });

  app.get("/api/interviews/:id/transcript", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const messages = await interviews.listMessages(asInterviewId(params.data.id));
    if (!messages.ok) return sendDomainError(reply, messages.error);
    return reply.send({
      ok: true,
      messages: messages.value.map(serializeInterviewMessage),
    });
  });

  app.post("/api/interviews/:id/ready", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const next = await interviews.markReady(asInterviewId(params.data.id));
    if (!next.ok) return sendDomainError(reply, next.error);
    metrics.countInterviewTransition(next.value.status);
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
    metrics.countInterviewTransition(next.value.status);
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
      // Idempotent: a repeat end still ensures an evaluation job exists.
      await evaluationService.enqueue(id);
      const refreshed = (await deps.repos.interviews.findById(id)) ?? state.value.interview;
      return reply.send({
        ok: true,
        interview: serializeInterview(refreshed),
        transitioned: false,
      });
    }
    if (status === "completing") {
      const done = await interviews.complete(id);
      if (!done.ok) return sendDomainError(reply, done.error);
      metrics.countInterviewTransition(done.value.status);
      request.log.info({ interviewId: id, to: "completed" }, "interview.lifecycle");
      await evaluationService.enqueue(id);
      const refreshed = (await deps.repos.interviews.findById(id)) ?? done.value;
      return reply.send({ ok: true, interview: serializeInterview(refreshed), transitioned: true });
    }
    if (status === "in_progress" || status === "paused") {
      const completing = await interviews.beginCompleting(id);
      if (!completing.ok) return sendDomainError(reply, completing.error);
      const done = await interviews.complete(id);
      if (!done.ok) return sendDomainError(reply, done.error);
      metrics.countInterviewTransition(done.value.status);
      request.log.info({ interviewId: id, to: "completed" }, "interview.lifecycle");
      // Phase 10: completion is immediate; the evaluation runs asynchronously.
      await evaluationService.enqueue(id);
      const refreshed = (await deps.repos.interviews.findById(id)) ?? done.value;
      return reply.send({ ok: true, interview: serializeInterview(refreshed), transitioned: true });
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
    metrics.countInterviewTransition(next.value.status);
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
    metrics.countInterviewTransition(next.value.status);
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
    metrics.countInterviewTransition(next.value.status);
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
    metrics.countInterviewTransition(next.value.status);
    request.log.info({ interviewId: next.value.id, to: "failed" }, "interview.lifecycle");
    return reply.send({ ok: true, interview: serializeInterview(next.value) });
  });

  // S8b retention (HLD 7.4): hard erase. App-only (the model never calls
  // this); live interviews are refused so a running voice session is never
  // pulled out from under the model. Clears the session record and audit-logs
  // the erasure (the interview's own event log is cascade-deleted with it).
  app.delete("/api/interviews/:id", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const deleted = await interviews.deleteInterview(asInterviewId(params.data.id));
    if (!deleted.ok) return sendDomainError(reply, deleted.error);
    activeVoiceSessions.delete(params.data.id);
    request.log.info(
      { interviewId: params.data.id, status: deleted.value.status },
      "interview.deleted",
    );
    metrics.countInterviewDeleted();
    return reply.send({ ok: true, deleted: { id: params.data.id, status: deleted.value.status } });
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

  // Feature 18c: dedicated content view over the reseeded columns. Same id
  // validation and 404 shape as GET /api/problems/:id; gap (title-only)
  // problems return 200 with null content fields via serializeProblemContent.
  app.get("/api/problems/:id/content", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const problem = await deps.repos.problems.findById(asProblemId(params.data.id));
    if (problem === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Problem ${params.data.id} does not exist`, false);
    }
    return reply.send({ ok: true, content: serializeProblemContent(problem) });
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
      interview: serializeInterview(recorded.value.interview),
      responseCount: responses.length,
    });
  });

  // Phase 10: the interview's evaluation. `null` until the async job finishes;
  // the interview's `evaluationStatus` carries pending/completed/failed. The
  // manual S5 form path is retired — `end` enqueues automatically.
  app.get("/api/interviews/:id/evaluation", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const result = await evaluationService.getEvaluation(asInterviewId(params.data.id));
    if (!result.ok) return sendDomainError(reply, result.error);
    return reply.send({
      ok: true,
      evaluation: result.value === null ? null : serializeEvaluation(result.value),
    });
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
    // F6-3: the per-interview submission cap is enforced in SubmissionService
    // (single point shared with the model tool path).
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
    metrics.countCodeSubmission();
    return reply
      .status(201)
      .send({ ok: true, submission: serializeSubmission(submitted.value) });
  });

    // Feature 18d: AI-only Submit. A second-AI verdict on the candidate's
    // code with no sandbox run — the verdict is computed and returned, and
    // the code is stored as a run-less submission (no runs, no verdict row).
    // Failures surface errors, never an invented verdict, and store nothing.
    // Body mirrors submitCodeSchema (submitCode-like guards).
  app.post("/api/interviews/:id/submit-verdict", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = submitCodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const id = asInterviewId(params.data.id);
    const state = await interviews.getState(id);
    if (!state.ok) return sendDomainError(reply, state.error);
    const current =
      parsed.data.problemId === undefined
        ? state.value.currentProblem
        : await deps.repos.problems.findById(asProblemId(parsed.data.problemId));
    const input = validateSubmitVerdictInput({
      interviewId: params.data.id,
      language: parsed.data.language,
      code: parsed.data.code,
      problem: current === null ? null : toVerdictProblem(current),
    });
    if (input === null) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid verdict input", false);
    }
    // No judge to call without LLM keys: 503 with plain copy, never the
    // raw "not configured" message and never a 502 (which means the model
    // ran and its output was unusable).
    if (submitVerdictModel instanceof UnconfiguredSubmitVerdictModel) {
      return sendApiError(
        reply,
        503,
        "VERDICT_NOT_CONFIGURED",
        "Submit verdict is unavailable right now. Try again later.",
        false,
      );
    }
    let proposal: SubmitVerdict | null;
    try {
      const judged = await submitVerdictModel.judge(input);
      if (judged.proposal === null) {
        return sendApiError(
          reply,
          502,
          "VERDICT_FAILED",
          judged.error ?? "Verdict model returned no verdict",
          true,
        );
      }
      proposal = validateSubmitVerdictProposal(judged.proposal);
    } catch (error) {
      return sendApiError(
        reply,
        502,
        "VERDICT_FAILED",
        error instanceof Error ? error.message : "Verdict model failed",
        true,
      );
    }
    if (proposal === null) {
      return sendApiError(
        reply,
        502,
        "VERDICT_FAILED",
        "Verdict model returned an invalid verdict",
        true,
      );
    }
    // Fix: Submit persists the code as a run-less submission through the
    // same service the Test path uses (shared cap, status and problem
    // guards), so the evaluation reader credits coding evidence. Still no
    // sandbox run, no verdict row. Only a judged submit persists: 400/404
    // and 502/503 failures store nothing.
    const stored = await submissions.submit(id, {
      language: parsed.data.language,
      code: parsed.data.code,
      ...(parsed.data.problemId === undefined
        ? {}
        : { problemId: parsed.data.problemId }),
    });
    if (!stored.ok) return sendDomainError(reply, stored.error);
    request.log.info(
      { interviewId: params.data.id, submissionId: stored.value.id },
      "code.verdict",
    );
    return reply.send({ ok: true, verdict: serializeSubmitVerdict(proposal) });
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
      // F6-3: concurrency is enforced in SubmissionService (shared with the
      // model tool path).
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
      metrics.countCodeRun(run.value.status);
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

  app.post(
    "/api/interviews/:id/tool-exec",
    async (request, reply) => {
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
        // Transient quota/capacity (F6-3): throw so it is not cached and the
        // route can answer 429 retryable:true.
        if (result.error.code === "RATE_LIMITED") {
          throw new RateLimitedToolError(result.error.message);
        }
        return { ok: false as const, result: null, error: result.error };
      });
    } catch (error) {
      if (error instanceof CallIdConflictError) {
        return sendDomainError(reply, error.toDomainError());
      }
      if (error instanceof CallIdToolMismatchError) {
        return sendDomainError(reply, error.toDomainError());
      }
      if (error instanceof RateLimitedToolError) {
        return sendApiError(reply, 429, "RATE_LIMITED", error.message, true);
      }
      throw error;
    }
    const elapsedMs = Date.now() - startedAt;
    request.log.info(
      { interviewId: interviewId as string, callId, tool, elapsedMs, replayed: outcome.replayed, ok: outcome.record.ok },
      "tool.executed",
    );
    const record = outcome.record;
    metrics.countTool(outcome.replayed, record.ok);
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

  app.post(
    "/api/interviews/:id/voice-session",
    async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const id: InterviewId = asInterviewId(params.data.id);
    const state = await interviews.getState(id);
    if (!state.ok) return sendDomainError(reply, state.error);
    const status = state.value.interview.status;
    const needsStart = status === "ready";
    if (!needsStart && status !== "in_progress" && status !== "paused") {
      metrics.countVoiceRejected();
      return sendApiError(
        reply,
        409,
        "ILLEGAL_TRANSITION",
        `Voice session requires a ready or running interview (current: ${status})`,
        false,
      );
    }
    // V3-1: drop expired mints before the quota check.
    sweepExpiredVoiceSessions();
    // S8a quota: bound the in-memory session map (abuse protection).
    if (!activeVoiceSessions.has(params.data.id) && activeVoiceSessions.size >= config.voice.maxActiveSessions) {
      metrics.countVoiceRejected();
      return sendApiError(
        reply,
        429,
        "RATE_LIMITED",
        `Too many active voice sessions (max ${config.voice.maxActiveSessions}); retry shortly`,
        true,
      );
    }
    let mint;
    try {
      mint = await voiceProvider.mint(id);
    } catch (error) {
      if (error instanceof VoiceNotConfiguredError) {
        metrics.countVoiceRejected();
        return sendApiError(reply, 503, "VOICE_NOT_CONFIGURED", error.message, false);
      }
      throw error;
    }
    // V3-4: start only after a successful mint, so a 429/503 does not record
    // a false start on an interview that never received a session.
    if (needsStart) {
      const started = await interviews.start(id);
      if (!started.ok) return sendDomainError(reply, started.error);
      metrics.countInterviewTransition(started.value.status);
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
    metrics.countVoiceMinted();
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
    // Phase 7: best-effort learning-loop context (profile/topic/objective/skill)
    // so the interviewer opens grounded. Only a user session has an owner to
    // scope the reads; a service/anonymous caller (CLI harness) mints without
    // it, and any failure degrades to the generic interview rather than
    // blocking the mint.
    const caller = request.caller;
    let sessionContext: SessionContext = {};
    if (caller !== undefined && caller.kind === "user") {
      try {
        const [profile, curriculum, skillSnapshot] = await Promise.all([
          profiles.get(caller.userId),
          curricula.getDefault(),
          skills.getSnapshot(caller.userId),
        ]);
        sessionContext = assembleSessionContext({
          profile,
          curriculum,
          skills: skillSnapshot.skills,
          problem: state.value.currentProblem,
        });
      } catch {
        sessionContext = {};
      }
    }
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
          ...sessionContext,
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

  return { app, toolIdempotency, activeVoiceSessions, metrics };
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
