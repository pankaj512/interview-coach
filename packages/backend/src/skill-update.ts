// @interview-coach/backend — deterministic skill/curriculum update (Phase 11).
//
// Applies a persisted ("accepted") evaluation to the user's learning state:
// the mastery level for the evaluated topic and the curriculum pointer. The
// decision is a pure function of persisted state (see
// `@interview-coach/domain` `skill-update.ts`); this service is the storage
// boundary, invoked by the async evaluation job — never a realtime tool and
// never a route (ADR-002).

import {
  planSkillUpdate,
  type Evaluation,
  type RepositorySet,
  type Result,
  type SkillUpdatePlan,
  type SkillUpdatePolicy,
  type TopicId,
  type UserId,
  err,
  ok,
} from "@interview-coach/domain";
import type { CurriculumService } from "./curriculum.js";

export interface SkillUpdateServiceDeps {
  readonly skillStates: RepositorySet["skillStates"];
  readonly curriculumProgress: RepositorySet["curriculumProgress"];
  readonly curricula: CurriculumService;
  readonly policy?: SkillUpdatePolicy;
}

export type SkillUpdateSkipReason = "no_topic" | "unknown_topic" | "already_applied";

export interface SkillUpdateOutcome {
  readonly applied: boolean;
  readonly reason?: SkillUpdateSkipReason;
  readonly plan?: SkillUpdatePlan;
}

export class SkillUpdateService {
  private readonly skillStates: RepositorySet["skillStates"];
  private readonly curriculumProgress: RepositorySet["curriculumProgress"];
  private readonly curricula: CurriculumService;
  private readonly policy?: SkillUpdatePolicy;

  constructor(deps: SkillUpdateServiceDeps) {
    this.skillStates = deps.skillStates;
    this.curriculumProgress = deps.curriculumProgress;
    this.curricula = deps.curricula;
    if (deps.policy !== undefined) this.policy = deps.policy;
  }

  async apply(input: {
    readonly evaluation: Evaluation;
    readonly userId: UserId;
    readonly now?: Date;
  }): Promise<Result<SkillUpdateOutcome>> {
    const topicId: TopicId | undefined = input.evaluation.topicId;
    if (topicId === undefined) return ok({ applied: false, reason: "no_topic" });
    const lookup = await this.curricula.findTopic(topicId);
    if (lookup === null) return ok({ applied: false, reason: "unknown_topic" });

    const [skillState, progress] = await Promise.all([
      this.skillStates.findByTopic(input.userId, lookup.curriculum.id, topicId),
      this.curriculumProgress.findByUser(input.userId, lookup.curriculum.id),
    ]);

    const planned = planSkillUpdate({
      userId: input.userId,
      topicId,
      curriculum: lookup.curriculum,
      evaluation: input.evaluation,
      skillState,
      progress,
      ...(this.policy === undefined ? {} : { policy: this.policy }),
      ...(input.now === undefined ? {} : { now: input.now }),
    });
    if (!planned.ok) return err(planned.error);
    if (planned.value === null) return ok({ applied: false, reason: "already_applied" });

    // Persist the curriculum pointer first, then the skill state that carries
    // the idempotency marker. A retry after a partial write re-plans from the
    // unchanged skill state and re-applies the same deterministic result.
    await this.curriculumProgress.save(planned.value.progress);
    await this.skillStates.save(planned.value.skillState);
    return ok({ applied: true, plan: planned.value });
  }
}
