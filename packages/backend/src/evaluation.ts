// @interview-coach/backend - async evaluation service (Phase 10).
//
// Turns a completed interview into a persisted, validated evaluation. `end`
// enqueues a durable EvaluationJob; the runner assembles the context, calls
// the server-side EvaluationModel, validates the proposal, and falls back
// deterministically when the model is unavailable or invalid (ADR-002). The
// interview is never lost: a failed job marks `evaluationStatus: "failed"`
// and leaves the interview intact.
//
// The runner is in-process for v1; tests inject `runSynchronously` so the
// enqueue path is deterministic without timers.

import {
  MAX_EVALUATION_JOB_ATTEMPTS,
  buildFallbackEvaluation,
  createEvaluationJob,
  finalizeEvaluation,
  validateEvaluationProposal,
  type Clock,
  type Evaluation,
  type EvaluationJob,
  type EvaluationJobId,
  type EvaluationModel,
  type EvaluationModelInput,
  type EvaluationProposal,
  type InterviewId,
  type InterviewMessage,
  type RepositorySet,
  type Result,
  type UserId,
  asTopicId,
  domainError,
  err,
  ok,
  systemClock,
} from "@interview-coach/domain";
import type { InterviewService } from "@interview-coach/domain";
import type { CurriculumService } from "./curriculum.js";
import type { ProfileService } from "./profile.js";
import type { SkillService } from "./skills.js";
import type { SkillUpdateService } from "./skill-update.js";
import type { RecommendationService } from "./recommendation.js";
import type { BackendMetrics } from "./metrics.js";
import { assembleEvaluationContext, type AssembleEvaluationContextInput } from "./evaluation-context.js";

export interface EvaluationServiceDeps {
  readonly repos: RepositorySet;
  readonly interviews: InterviewService;
  readonly curricula: CurriculumService;
  readonly profiles: ProfileService;
  readonly skills: SkillService;
  readonly skillUpdates: SkillUpdateService;
  readonly recommendations: RecommendationService;
  readonly model: EvaluationModel;
  readonly clock?: Clock;
  /** Tests set true so `enqueue` awaits the job instead of scheduling it. */
  readonly runSynchronously?: boolean;
  /** Phase 12 loop counters (optional so unit tests can omit them). */
  readonly metrics?: BackendMetrics;
}

export interface EnqueueResult {
  readonly job: EvaluationJob | null;
  /** True when a real (dimension-bearing) evaluation already existed. */
  readonly alreadyEvaluated: boolean;
}

export class EvaluationService {
  private readonly repos: RepositorySet;
  private readonly interviews: InterviewService;
  private readonly curricula: CurriculumService;
  private readonly profiles: ProfileService;
  private readonly skills: SkillService;
  private readonly skillUpdates: SkillUpdateService;
  private readonly recommendations: RecommendationService;
  private readonly model: EvaluationModel;
  private readonly clock: Clock;
  private readonly runSynchronously: boolean;
  private readonly metrics: BackendMetrics | undefined;

  constructor(deps: EvaluationServiceDeps) {
    this.repos = deps.repos;
    this.interviews = deps.interviews;
    this.curricula = deps.curricula;
    this.profiles = deps.profiles;
    this.skills = deps.skills;
    this.skillUpdates = deps.skillUpdates;
    this.recommendations = deps.recommendations;
    this.model = deps.model;
    this.clock = deps.clock ?? systemClock;
    this.runSynchronously = deps.runSynchronously ?? false;
    this.metrics = deps.metrics;
  }

  // Idempotent: returns null when a real evaluation already exists, the active
  // job when one is pending/running, else creates + schedules a job.
  async enqueue(interviewId: InterviewId): Promise<Result<EnqueueResult>> {
    const interview = await this.repos.interviews.findById(interviewId);
    if (interview === null) {
      return err(domainError("NOT_FOUND", `Interview ${interviewId} does not exist`, { interviewId }));
    }
    if (interview.status !== "completed" && interview.status !== "completing") {
      return err(
        domainError(
          "ILLEGAL_TRANSITION",
          `Cannot evaluate interview ${interviewId} while ${interview.status}`,
          { status: interview.status },
        ),
      );
    }
    const existingEvaluation = await this.repos.evaluations.findByInterview(interviewId);
    if (isRealEvaluation(existingEvaluation)) {
      return ok({ job: await this.repos.evaluationJobs.findByInterview(interviewId), alreadyEvaluated: true });
    }
    const existingJob = await this.repos.evaluationJobs.findByInterview(interviewId);
    if (existingJob !== null && (existingJob.status === "pending" || existingJob.status === "running")) {
      return ok({ job: existingJob, alreadyEvaluated: false });
    }
    const job = createEvaluationJob({ interviewId, now: this.clock.now() });
    await this.repos.evaluationJobs.save(job);
    await this.interviews.markEvaluationStatus(interviewId, "pending");
    if (this.runSynchronously) {
      await this.runJob(job.id);
    } else {
      queueMicrotask(() => {
        void this.runJob(job.id);
      });
    }
    return ok({ job, alreadyEvaluated: false });
  }

  // Claims a job and produces the evaluation. Safe to call twice: a completed
  // job replays its stored evaluation.
  async runJob(jobId: EvaluationJobId): Promise<Result<Evaluation>> {
    const job = await this.repos.evaluationJobs.findById(jobId);
    if (job === null) {
      return err(domainError("NOT_FOUND", `Evaluation job ${jobId} does not exist`, { jobId }));
    }
    if (job.status === "completed") {
      const evaluation = await this.repos.evaluations.findByInterview(job.interviewId);
      if (isRealEvaluation(evaluation)) return ok(evaluation);
      return err(domainError("CONFLICT", `Evaluation job ${jobId} is completed but has no evaluation`));
    }
    if (job.status === "failed") {
      return err(domainError("CONFLICT", `Evaluation job ${jobId} has failed`, { jobId }));
    }

    const attempts = job.attempts + 1;
    const now = this.clock.now();
    await this.repos.evaluationJobs.save({
      ...job,
      status: "running",
      attempts,
      startedAt: job.startedAt ?? now,
      updatedAt: now,
    });

    try {
      const input = await this.assembleInput(job.interviewId);
      // A previous attempt may have recorded the evaluation before failing
      // later in the job. Reuse it (same id) so the Phase 11 skill update
      // stays idempotent instead of scoring the interview twice.
      const existing = await this.repos.evaluations.findByInterview(job.interviewId);
      let evaluation: Evaluation;
      if (isRealEvaluation(existing)) {
        evaluation = existing;
      } else {
        const { proposal, source } = await this.propose(input);
        const finalized = finalizeEvaluation({
          dimensions: proposal.dimensions,
          hintsUsed: input.hintsUsed,
          strengths: [...proposal.strengths],
          weaknesses: [...proposal.weaknesses],
        });
        const interview = await this.repos.interviews.findById(job.interviewId);
        const recorded = await this.interviews.recordEvaluation(job.interviewId, {
          status: "completed",
          source,
          jobId: job.id,
          ...(interview?.topicId === undefined ? {} : { topicId: interview.topicId }),
          dimensions: finalized.dimensions,
          hintsUsed: finalized.hintsUsed,
          strengths: [...finalized.strengths],
          weaknesses: [...finalized.weaknesses],
          ...(finalized.overallScore === null ? {} : { overallScore: finalized.overallScore }),
          ...(finalized.recommendation === null
            ? {}
            : { recommendation: finalized.recommendation }),
        });
        if (!recorded.ok) throw recorded.error;
        evaluation = recorded.value;
      }
      // Phase 11: apply the accepted evaluation to mastery + curriculum.
      // Deterministic and idempotent (guarded by the evaluation id on the
      // skill state); a failure retries the job against the same evaluation.
      const skillUpdate = await this.skillUpdates.apply({
        evaluation,
        userId: input.candidateId as UserId,
      });
      if (!skillUpdate.ok) throw skillUpdate.error;
      // Phase 12: close the learning loop. A fresh skill update invalidates the
      // current recommendation and regenerates it from the new state. This is
      // best-effort: the evaluation is already persisted and must not be lost,
      // and an unregenerated recommendation self-heals via the Dashboard's
      // auto-generate when `current` is null.
      if (skillUpdate.value.applied) {
        await this.regenerateRecommendation(input.candidateId as UserId);
      }
      await this.interviews.markEvaluationStatus(job.interviewId, "completed");
      await this.repos.evaluationJobs.save({
        ...job,
        status: "completed",
        attempts,
        startedAt: job.startedAt ?? now,
        completedAt: this.clock.now(),
        updatedAt: this.clock.now(),
      });
      return ok(evaluation);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : "Evaluation failed";
      const exhausted = attempts >= MAX_EVALUATION_JOB_ATTEMPTS;
      await this.repos.evaluationJobs.save({
        ...job,
        status: exhausted ? "failed" : "pending",
        attempts,
        lastError: message,
        startedAt: job.startedAt ?? now,
        updatedAt: this.clock.now(),
      });
      if (exhausted) {
        await this.interviews.markEvaluationStatus(job.interviewId, "failed");
      }
      return err(domainError("CONFLICT", message));
    }
  }

  // The latest evaluation for the interview, or null before one is recorded.
  async getEvaluation(interviewId: InterviewId): Promise<Result<Evaluation | null>> {
    const interview = await this.repos.interviews.findById(interviewId);
    if (interview === null) {
      return err(domainError("NOT_FOUND", `Interview ${interviewId} does not exist`, { interviewId }));
    }
    return ok(await this.repos.evaluations.findByInterview(interviewId));
  }

  async currentJob(interviewId: InterviewId): Promise<EvaluationJob | null> {
    return this.repos.evaluationJobs.findByInterview(interviewId);
  }

  // Phase 12: supersede the current recommendation and generate a replacement
  // from the updated learning state. Best-effort: never fails the evaluation.
  private async regenerateRecommendation(userId: UserId): Promise<void> {
    try {
      await this.recommendations.invalidateCurrent(userId);
      const generated = await this.recommendations.generate(userId);
      if (!generated.ok) {
        this.metrics?.countRecommendationRegenerationFailure();
        return;
      }
      this.metrics?.countRecommendationRegenerated();
    } catch {
      this.metrics?.countRecommendationRegenerationFailure();
    }
  }

  private async propose(
    input: EvaluationModelInput,
  ): Promise<{ proposal: EvaluationProposal; source: "llm" | "fallback" }> {
    try {
      const result = await this.model.evaluate(input);
      const validated =
        result.proposal === null ? null : validateEvaluationProposal(result.proposal);
      if (validated !== null && Object.keys(validated.dimensions).length > 0) {
        return { proposal: validated, source: "llm" };
      }
    } catch {
      // Provider threw: fall through to the deterministic fallback.
    }
    return { proposal: buildFallbackEvaluation(input), source: "fallback" };
  }

  private async assembleInput(interviewId: InterviewId): Promise<EvaluationModelInput> {
    const state = await this.interviews.getState(interviewId);
    if (!state.ok) throw state.error;
    const interview = state.value.interview;
    const [profile, skillSnapshot, transcript, responses, submissions, runs] = await Promise.all([
      this.profiles.get(interview.candidateId as UserId),
      this.skills.getSnapshot(interview.candidateId as UserId),
      this.repos.messages.listByInterview(interviewId),
      this.repos.responses.listByInterview(interviewId),
      this.repos.submissions.listByInterview(interviewId),
      this.repos.runs.listByInterview(interviewId),
    ]);
    const topic = await this.resolveTopic(interview.topicId);
    const skillState =
      topic === null
        ? null
        : (skillSnapshot.skills.find((s) => s.topicId === topic.id) ?? null);
    const hintsUsed = state.value.evaluation?.hintsUsed ?? 0;
    const assembly: AssembleEvaluationContextInput = {
      interview,
      problem: state.value.currentProblem,
      topic,
      profile,
      skillState,
      transcript: transcript as readonly InterviewMessage[],
      responses,
      submissions,
      runs,
      hintsUsed,
    };
    return assembleEvaluationContext(assembly);
  }

  private async resolveTopic(topicId: string | undefined) {
    if (topicId === undefined) return null;
    const lookup = await this.curricula.findTopic(asTopicId(topicId));
    if (lookup === null) return null;
    const module = lookup.curriculum.modules.find((m) => m.id === lookup.topic.moduleId) ?? null;
    return {
      id: lookup.topic.id,
      name: lookup.topic.name,
      ...(module === null ? {} : { moduleName: module.name }),
      ...(module?.objective === undefined ? {} : { objective: module.objective }),
    };
  }
}

function isRealEvaluation(evaluation: Evaluation | null): evaluation is Evaluation {
  return (
    evaluation !== null &&
    evaluation.status === "completed" &&
    Object.keys(evaluation.dimensions).length > 0
  );
}
