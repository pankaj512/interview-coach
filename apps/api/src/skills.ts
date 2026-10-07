// @interview-coach/api - skill/curriculum-progress service (Phase 3).
//
// Reads and persists the per-user learning state (UserSkillState +
// UserCurriculumProgress). The mastery algorithm that turns an accepted
// evaluation into a new level is Phase 10/11; this service is the storage
// boundary so those phases (and recommendation) never touch repositories
// directly. Skill state is user-scoped server state: the route resolves the
// owner from the session, never from the body.

import {
  DSA_CURRICULUM_ID,
  type CurriculumId,
  type RepositorySet,
  type UserCurriculumProgress,
  type UserId,
  type UserSkillState,
} from "@interview-coach/core";

export interface SkillServiceDeps {
  readonly skillStates: RepositorySet["skillStates"];
  readonly curriculumProgress: RepositorySet["curriculumProgress"];
}

export interface UserSkillSnapshot {
  readonly skills: readonly UserSkillState[];
  readonly progress: UserCurriculumProgress | null;
}

export class SkillService {
  private readonly skillStates: RepositorySet["skillStates"];
  private readonly curriculumProgress: RepositorySet["curriculumProgress"];

  constructor(deps: SkillServiceDeps) {
    this.skillStates = deps.skillStates;
    this.curriculumProgress = deps.curriculumProgress;
  }

  async getSnapshot(
    userId: UserId,
    curriculumId: CurriculumId = DSA_CURRICULUM_ID,
  ): Promise<UserSkillSnapshot> {
    const [skills, progress] = await Promise.all([
      this.skillStates.findByUser(userId, curriculumId),
      this.curriculumProgress.findByUser(userId, curriculumId),
    ]);
    return { skills, progress };
  }

  async getSkill(
    userId: UserId,
    topicId: UserSkillState["topicId"],
    curriculumId: CurriculumId = DSA_CURRICULUM_ID,
  ): Promise<UserSkillState | null> {
    return this.skillStates.findByTopic(userId, curriculumId, topicId);
  }

  async saveSkillState(state: UserSkillState): Promise<void> {
    await this.skillStates.save(state);
  }

  async saveProgress(progress: UserCurriculumProgress): Promise<void> {
    await this.curriculumProgress.save(progress);
  }
}
