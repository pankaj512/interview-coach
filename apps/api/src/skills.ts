// @interview-coach/api - skill state storage boundary.
//
// Owns: reading and persisting per-user learning state so recommendation
// and later phases never touch repositories directly. Owner resolved
// from the session, never the body.
//
// History: Phase 3; see docs/SESSION_HANDOFF.md.

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
