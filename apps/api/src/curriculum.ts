// @interview-coach/api - curriculum application service.
//
// Owns: reads over the server-owned curriculum (single `dsa` curriculum in
// v1; topic lookup scans the loaded curricula). The browser never bundles
// the file and the model never reads it directly.
//
// History: Phase 3; see docs/SESSION_HANDOFF.md.

import {
  DSA_CURRICULUM_ID,
  type Curriculum,
  type CurriculumId,
  type CurriculumTopic,
  type InterviewType,
  type RepositorySet,
  type TopicId,
} from "@interview-coach/core";

export interface CurriculumServiceDeps {
  readonly curricula: RepositorySet["curricula"];
}

export interface CurriculumTopicLookup {
  readonly curriculum: Curriculum;
  readonly topic: CurriculumTopic;
}

export class CurriculumService {
  private readonly curricula: RepositorySet["curricula"];

  constructor(deps: CurriculumServiceDeps) {
    this.curricula = deps.curricula;
  }

  async list(interviewType?: InterviewType): Promise<readonly Curriculum[]> {
    const all = await this.curricula.list();
    return interviewType === undefined
      ? all
      : all.filter((curriculum) => curriculum.interviewType === interviewType);
  }

  async get(id: CurriculumId): Promise<Curriculum | null> {
    return this.curricula.findById(id);
  }

  // Resolves a topic across the loaded curricula (v1: dsa only). Returns the
  // owning curriculum so callers can validate topic/problem membership.
  async findTopic(topicId: TopicId): Promise<CurriculumTopicLookup | null> {
    const all = await this.curricula.list();
    for (const curriculum of all) {
      const topic = curriculum.topics.find((t) => t.id === topicId);
      if (topic !== undefined) return { curriculum, topic };
    }
    return null;
  }

  // Default curriculum for the only v1 interview type.
  async getDefault(): Promise<Curriculum | null> {
    return this.curricula.findById(DSA_CURRICULUM_ID);
  }
}
