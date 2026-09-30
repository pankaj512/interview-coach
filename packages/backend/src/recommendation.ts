// @interview-coach/backend - recommendation application service (Phase 4).
//
// Owns the recommendation rule: build a deterministic candidate set from the
// server-owned curriculum + the user's skill/progress state, ask the
// server-side LLM (if configured) to pick from it, validate the proposal, and
// persist the result. If the model is unavailable, slow, or invalid, the
// deterministic fallback guarantees a result - the loop never dead-ends.
//
// The recommendation is user-scoped server state: the route resolves the owner
// from the session, never the body. The LLM never becomes the system of record
// (ADR-002): only backend-validated candidates are persisted.

import {
  DSA_CURRICULUM_ID,
  acceptRecommendation,
  buildRecommendationCandidates,
  createRecommendation,
  fallbackRecommendation,
  supersedeRecommendation,
  validateRecommendationProposal,
  type CurriculumId,
  type DomainError,
  type Recommendation,
  type RecommendationId,
  type RecommendationModel,
  type RecommendationModelResult,
  type RecommendationSource,
  type RepositorySet,
  type Result,
  type UserId,
} from "@interview-coach/domain";
import { err, ok } from "@interview-coach/domain";

export interface RecommendationServiceDeps {
  readonly recommendations: RepositorySet["recommendations"];
  readonly curricula: RepositorySet["curricula"];
  readonly problems: RepositorySet["problems"];
  readonly skillStates: RepositorySet["skillStates"];
  readonly curriculumProgress: RepositorySet["curriculumProgress"];
  readonly profiles: RepositorySet["profiles"];
  readonly model: RecommendationModel;
  readonly now?: () => Date;
}

export interface GeneratedRecommendation {
  readonly recommendation: Recommendation;
  readonly source: RecommendationSource;
  /** Present when the deterministic fallback was used because the model failed. */
  readonly modelError?: string;
}

export class RecommendationService {
  private readonly recommendations: RepositorySet["recommendations"];
  private readonly curricula: RepositorySet["curricula"];
  private readonly problems: RepositorySet["problems"];
  private readonly skillStates: RepositorySet["skillStates"];
  private readonly curriculumProgress: RepositorySet["curriculumProgress"];
  private readonly profiles: RepositorySet["profiles"];
  private readonly model: RecommendationModel;
  private readonly clock: () => Date;

  constructor(deps: RecommendationServiceDeps) {
    this.recommendations = deps.recommendations;
    this.curricula = deps.curricula;
    this.problems = deps.problems;
    this.skillStates = deps.skillStates;
    this.curriculumProgress = deps.curriculumProgress;
    this.profiles = deps.profiles;
    this.model = deps.model;
    this.clock = deps.now ?? (() => new Date());
  }

  async current(
    userId: UserId,
    curriculumId: CurriculumId = DSA_CURRICULUM_ID,
  ): Promise<Recommendation | null> {
    return this.recommendations.findCurrentByUser(userId, curriculumId);
  }

  // Phase 12: supersede every non-superseded proposal so `current` is
  // unambiguous. Called explicitly by the learning loop (after a skill update)
  // and internally by `generate` before persisting the replacement. Idempotent;
  // returns how many rows transitioned.
  async invalidateCurrent(
    userId: UserId,
    curriculumId: CurriculumId = DSA_CURRICULUM_ID,
  ): Promise<number> {
    const now = this.clock();
    const existing = await this.recommendations.listByUser(userId, curriculumId);
    let superseded = 0;
    for (const prior of existing) {
      if (prior.status === "superseded") continue;
      const next = supersedeRecommendation(prior, now);
      if (next.ok) {
        await this.recommendations.save(next.value);
        superseded += 1;
      }
    }
    return superseded;
  }

  async generate(
    userId: UserId,
    curriculumId: CurriculumId = DSA_CURRICULUM_ID,
  ): Promise<Result<GeneratedRecommendation, DomainError>> {
    const curriculum = await this.curricula.findById(curriculumId);
    if (curriculum === null) {
      return err({
        code: "NOT_FOUND",
        message: `Curriculum ${curriculumId} is not seeded`,
      });
    }
    const [profile, skills, progress, problems] = await Promise.all([
      this.profiles.findByUserId(userId),
      this.skillStates.findByUser(userId, curriculumId),
      this.curriculumProgress.findByUser(userId, curriculumId),
      this.problems.list(),
    ]);
    const candidateSet = buildRecommendationCandidates({
      curriculum,
      problems,
      skills,
      progress,
    });
    const fallback = fallbackRecommendation(candidateSet);
    if (fallback === null) {
      return err({
        code: "NOT_FOUND",
        message: "Curriculum has no candidate problems to recommend",
      });
    }

    let validated = fallback;
    let source: RecommendationSource = "fallback";
    let modelError: string | undefined;
    let result: RecommendationModelResult;
    try {
      result = await this.model.recommend({ profile, candidateSet, skills, progress });
    } catch (error) {
      result = {
        proposal: null,
        error: error instanceof Error ? error.message : "Recommendation model error",
      };
    }
    if (result.proposal !== null) {
      const checked = validateRecommendationProposal(result.proposal, candidateSet);
      if (checked.ok) {
        validated = checked.value;
        source = "llm";
      } else {
        modelError = checked.error.message;
      }
    } else if (result.error !== undefined) {
      modelError = result.error;
    }

    const now = this.clock();
    // Supersede every prior non-superseded proposal so `current` is unambiguous
    // (Phase 12 regenerates after evaluation using this same transition).
    await this.invalidateCurrent(userId, curriculumId);

    const created = createRecommendation({
      userId,
      curriculumId,
      recommendationType: validated.recommendationType,
      topicId: validated.candidate.topicId,
      problemId: validated.candidate.problemId,
      reason: validated.reason,
      source,
      now,
    });
    if (!created.ok) return created;
    await this.recommendations.save(created.value);
    return ok({
      recommendation: created.value,
      source,
      ...(modelError === undefined ? {} : { modelError }),
    });
  }

  async accept(
    userId: UserId,
    recommendationId: RecommendationId,
  ): Promise<Result<Recommendation, DomainError>> {
    const existing = await this.recommendations.findById(recommendationId);
    // Foreign ids read as 404 (no ownership oracle), like the interview routes.
    if (existing === null || existing.userId !== userId) {
      return err({
        code: "NOT_FOUND",
        message: `Recommendation ${recommendationId} does not exist`,
      });
    }
    const accepted = acceptRecommendation(existing, this.clock());
    if (!accepted.ok) return accepted;
    await this.recommendations.save(accepted.value);
    return accepted;
  }
}
