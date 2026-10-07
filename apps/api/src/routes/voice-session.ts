import type { FastifyInstance } from "fastify";
import {
  InterviewService,
  SubmissionService,
  asInterviewId,
  type InterviewConfiguration,
  type InterviewId,
} from "@interview-coach/core";
import { sendApiError, sendDomainError } from "../http-errors.js";
import { BackendMetrics } from "../metrics.js";
import type { BackendConfig } from "../config.js";
import { ProfileService } from "../profile.js";
import { CurriculumService } from "../curriculum.js";
import { SkillService } from "../skills.js";
import {
  FROZEN_VOICE_SESSION_CONFIG,
  VoiceNotConfiguredError,
  buildSessionInstructions,
  buildVoiceWebSocketUrl,
  type VoiceSessionProvider,
} from "../voice-session.js";
import { assembleSessionContext, type SessionContext } from "../session-context.js";
import { idParamSchema, zodMessage } from "./shared.js";

export interface ActiveVoiceSession {
  readonly interviewId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface VoiceSessionRouteDeps {
  readonly interviews: InterviewService;
  readonly submissions: SubmissionService;
  readonly profiles: ProfileService;
  readonly curricula: CurriculumService;
  readonly skills: SkillService;
  readonly voiceProvider: VoiceSessionProvider;
  readonly config: BackendConfig;
  readonly activeVoiceSessions: Map<string, ActiveVoiceSession>;
  readonly sweepExpiredVoiceSessions: (now?: number) => number;
  readonly metrics: BackendMetrics;
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
      ? ` - ${problem.expectedConcepts.join(", ")}`
      : "";
  return `${problem.title} (${problem.difficulty})${concepts}`;
}

export function registerVoiceSessionRoutes(app: FastifyInstance, ctx: VoiceSessionRouteDeps): void {
  app.post(
    "/api/interviews/:id/voice-session",
    async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const id: InterviewId = asInterviewId(params.data.id);
    const state = await ctx.interviews.getState(id);
    if (!state.ok) return sendDomainError(reply, state.error);
    const status = state.value.interview.status;
    const needsStart = status === "ready";
    if (!needsStart && status !== "in_progress" && status !== "paused") {
      ctx.metrics.countVoiceRejected();
      return sendApiError(
        reply,
        409,
        "ILLEGAL_TRANSITION",
        `Voice session requires a ready or running interview (current: ${status})`,
        false,
      );
    }
    // V3-1: drop expired mints before the quota check.
    ctx.sweepExpiredVoiceSessions();
    // S8a quota: bound the in-memory session map (abuse protection).
    if (!ctx.activeVoiceSessions.has(params.data.id) && ctx.activeVoiceSessions.size >= ctx.config.voice.maxActiveSessions) {
      ctx.metrics.countVoiceRejected();
      return sendApiError(
        reply,
        429,
        "RATE_LIMITED",
        `Too many active voice sessions (max ${ctx.config.voice.maxActiveSessions}); retry shortly`,
        true,
      );
    }
    let mint;
    try {
      mint = await ctx.voiceProvider.mint(id);
    } catch (error) {
      if (error instanceof VoiceNotConfiguredError) {
        ctx.metrics.countVoiceRejected();
        return sendApiError(reply, 503, "VOICE_NOT_CONFIGURED", error.message, false);
      }
      throw error;
    }
    // V3-4: start only after a successful mint, so a 429/503 does not record
    // a false start on an interview that never received a session.
    if (needsStart) {
      const started = await ctx.interviews.start(id);
      if (!started.ok) return sendDomainError(reply, started.error);
      ctx.metrics.countInterviewTransition(started.value.status);
    }
    const endpoint = mint.endpoint !== "" ? mint.endpoint : ctx.config.voice.endpoint;
    const model = mint.model !== "" ? mint.model : ctx.config.voice.model;
    const apiVersion = mint.apiVersion !== "" ? mint.apiVersion : ctx.config.voice.apiVersion;
    const voiceName = mint.voiceName !== "" ? mint.voiceName : ctx.config.voice.voiceName;
    const expiresAt = mint.expiresAt.toISOString();
    ctx.activeVoiceSessions.set(params.data.id, {
      interviewId: params.data.id,
      createdAt: new Date().toISOString(),
      expiresAt,
    });
    request.log.info(
      { interviewId: params.data.id, mode: mint.mode },
      "voice_session.created",
    );
    ctx.metrics.countVoiceMinted();
    // S7a sandbox summary (HLD 6.4): code progress travels with the mint so
    // the model starts aware of submissions and latest run verdicts.
    const submissionCount = await ctx.submissions.submissionCount(id);
    const latestRun = await ctx.submissions.latestSummary(id);
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
          ctx.profiles.get(caller.userId),
          ctx.curricula.getDefault(),
          ctx.skills.getSnapshot(caller.userId),
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
}
