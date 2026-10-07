// @interview-coach/api - curriculum application service (Phase 3).
//
// Reads the server-owned curriculum (static seeded config). The backend is the
// only source: the browser never bundles the curriculum file, and the model
// never reads it directly. v1 has a single curriculum (dsa), so topic lookup
// scans the loaded curricula.

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
