import type {
  EvaluationId,
  InterviewId,
  ProblemId,
  ResponseId,
  RunId,
  SubmissionId,
  UserId,
  CurriculumId,
  TopicId,
  RecommendationId,
  EvaluationJobId,
} from "./ids.js";
import type { UserAccount, UserSession } from "./user.js";
import type { UserProfile } from "./profile.js";
import type { Curriculum } from "./curriculum.js";
import type { UserCurriculumProgress, UserSkillState } from "./skill.js";
import type { Recommendation } from "./recommendation.js";
import type { CandidateResponse } from "./candidate-response.js";
import type { InterviewMessage } from "./interview-message.js";
import type { EvaluationJob } from "./evaluation-job.js";
import type { CodeRun, CodeSubmission } from "./submission.js";
import type { Evaluation } from "./evaluation.js";
import type { Interview } from "./interview.js";
import type { InterviewEvent } from "./interview-event.js";
import type { Problem } from "./problem.js";

// Repository contracts. S1 ships in-memory implementations for unit tests;
// S2 swaps in Drizzle/Postgres implementations behind these same
// interfaces. All async so service signatures stay stable across the swap.
export interface InterviewRepository {
  save(interview: Interview): Promise<void>;
  findById(id: InterviewId): Promise<Interview | null>;
  // Phase 9: server-backed history listing, newest first (updatedAt desc).
  listByCandidate(candidateId: UserId, limit?: number): Promise<readonly Interview[]>;
  // S8b retention (HLD 7.4): hard delete. Postgres cascades every
  // interview-scoped row (assignments, responses, evaluations, events,
  // submissions, runs) via onDelete cascade; the catalog is untouched.
  // Returns false when the interview does not exist.
  deleteById(id: InterviewId): Promise<boolean>;
}

export interface ProblemRepository {
  save(problem: Problem): Promise<void>;
  findById(id: ProblemId): Promise<Problem | null>;
  findManyByIds(ids: readonly ProblemId[]): Promise<readonly Problem[]>;
  list(): Promise<readonly Problem[]>;
}

export interface ResponseRepository {
  append(response: CandidateResponse): Promise<void>;
  listByInterview(interviewId: InterviewId): Promise<readonly CandidateResponse[]>;
}

export interface EvaluationRepository {
  save(evaluation: Evaluation): Promise<void>;
  findByInterview(interviewId: InterviewId): Promise<Evaluation | null>;
  // Phase 9: batch read for the history list (avoids N+1).
  listByInterviewIds(interviewIds: readonly InterviewId[]): Promise<readonly Evaluation[]>;
}

// Phase 9: structured transcript. Append-only; reads are chronological.
export interface InterviewMessageRepository {
  append(message: InterviewMessage): Promise<void>;
  listByInterview(interviewId: InterviewId): Promise<readonly InterviewMessage[]>;
}

// Phase 10: durable evaluation jobs. `findByInterview` returns the latest job
// (the one the status API reports); `listPending` is the runner's work queue.
export interface EvaluationJobRepository {
  save(job: EvaluationJob): Promise<void>;
  findById(id: EvaluationJobId): Promise<EvaluationJob | null>;
  findByInterview(interviewId: InterviewId): Promise<EvaluationJob | null>;
  listPending(): Promise<readonly EvaluationJob[]>;
}

export interface EventRepository {
  append(event: InterviewEvent): Promise<void>;
  listByInterview(interviewId: InterviewId): Promise<readonly InterviewEvent[]>;
}

// S7a sandbox persistence (HLD 6.1/6.3): submissions + runs are
// backend-owned artefacts like responses - persisted separately from raw
// conversation, restart-safe, readable by evaluation (HLD 6.4).
export interface SubmissionRepository {
  save(submission: CodeSubmission): Promise<void>;
  findById(id: SubmissionId): Promise<CodeSubmission | null>;
  listByInterview(interviewId: InterviewId): Promise<readonly CodeSubmission[]>;
}

export interface RunRepository {
  save(run: CodeRun): Promise<void>;
  findById(id: RunId): Promise<CodeRun | null>;
  listByInterview(interviewId: InterviewId): Promise<readonly CodeRun[]>;
  listBySubmission(submissionId: SubmissionId): Promise<readonly CodeRun[]>;
}

export class InMemoryInterviewRepository implements InterviewRepository {
  private readonly store = new Map<InterviewId, Interview>();

  async save(interview: Interview): Promise<void> {
    this.store.set(interview.id, interview);
  }

  async findById(id: InterviewId): Promise<Interview | null> {
    return this.store.get(id) ?? null;
  }

  // Newest first by updatedAt (Phase 9 history). Ties keep insertion order.
  async listByCandidate(
    candidateId: UserId,
    limit = 50,
  ): Promise<readonly Interview[]> {
    return [...this.store.values()]
      .filter((i) => i.candidateId === candidateId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }

  async deleteById(id: InterviewId): Promise<boolean> {
    return this.store.delete(id);
  }
}

export class InMemoryProblemRepository implements ProblemRepository {
  private readonly store = new Map<ProblemId, Problem>();

  async save(problem: Problem): Promise<void> {
    this.store.set(problem.id, problem);
  }

  async findById(id: ProblemId): Promise<Problem | null> {
    return this.store.get(id) ?? null;
  }

  async findManyByIds(ids: readonly ProblemId[]): Promise<readonly Problem[]> {
    const found: Problem[] = [];
    for (const id of ids) {
      const problem = this.store.get(id);
      if (problem !== undefined) found.push(problem);
    }
    return found;
  }

  // Stable order (audit P2-4): matches Drizzle's `order by title` so reads
  // are deterministic regardless of insertion order.
  async list(): Promise<readonly Problem[]> {
    return [...this.store.values()].sort((a, b) => a.title.localeCompare(b.title));
  }
}

export class InMemoryResponseRepository implements ResponseRepository {
  private readonly store = new Map<ResponseId, CandidateResponse>();

  async append(response: CandidateResponse): Promise<void> {
    this.store.set(response.id, response);
  }

  // Oldest-first by createdAt, matching the Drizzle `asc(created_at)` read
  // (audit P2-3). Array.sort is stable, so equal (injected) timestamps keep
  // insertion order - the deterministic tie-break Postgres cannot offer.
  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly CandidateResponse[]> {
    return [...this.store.values()]
      .filter((r) => r.interviewId === interviewId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export class InMemoryEvaluationRepository implements EvaluationRepository {
  private readonly store = new Map<EvaluationId, Evaluation>();

  async save(evaluation: Evaluation): Promise<void> {
    this.store.set(evaluation.id, evaluation);
  }

  // Latest evaluation for the interview (audit F7): matches the Drizzle
  // implementation, which orders by created_at desc. Ties break on updatedAt
  // so a hint-accounting update to an existing row still wins.
  async findByInterview(interviewId: InterviewId): Promise<Evaluation | null> {
    let latest: Evaluation | null = null;
    for (const evaluation of this.store.values()) {
      if (evaluation.interviewId !== interviewId) continue;
      if (
        latest === null ||
        evaluation.createdAt.getTime() > latest.createdAt.getTime() ||
        (evaluation.createdAt.getTime() === latest.createdAt.getTime() &&
          evaluation.updatedAt.getTime() >= latest.updatedAt.getTime())
      ) {
        latest = evaluation;
      }
    }
    return latest;
  }

  async listByInterviewIds(
    interviewIds: readonly InterviewId[],
  ): Promise<readonly Evaluation[]> {
    const wanted = new Set(interviewIds);
    // One latest evaluation per interview, matching findByInterview.
    const latest = new Map<InterviewId, Evaluation>();
    for (const evaluation of this.store.values()) {
      if (!wanted.has(evaluation.interviewId)) continue;
      const current = latest.get(evaluation.interviewId);
      if (
        current === undefined ||
        evaluation.createdAt.getTime() > current.createdAt.getTime() ||
        (evaluation.createdAt.getTime() === current.createdAt.getTime() &&
          evaluation.updatedAt.getTime() >= current.updatedAt.getTime())
      ) {
        latest.set(evaluation.interviewId, evaluation);
      }
    }
    return [...latest.values()];
  }
}

export class InMemoryInterviewMessageRepository implements InterviewMessageRepository {
  private readonly messages: InterviewMessage[] = [];

  async append(message: InterviewMessage): Promise<void> {
    this.messages.push(message);
  }

  // Oldest-first by createdAt, matching the Drizzle `asc(created_at)` read.
  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly InterviewMessage[]> {
    return this.messages
      .filter((m) => m.interviewId === interviewId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export class InMemoryEvaluationJobRepository implements EvaluationJobRepository {
  private readonly store = new Map<EvaluationJobId, EvaluationJob>();

  async save(job: EvaluationJob): Promise<void> {
    this.store.set(job.id, job);
  }

  async findById(id: EvaluationJobId): Promise<EvaluationJob | null> {
    return this.store.get(id) ?? null;
  }

  // Latest job for the interview (createdAt desc, updatedAt tie-break).
  async findByInterview(interviewId: InterviewId): Promise<EvaluationJob | null> {
    let latest: EvaluationJob | null = null;
    for (const job of this.store.values()) {
      if (job.interviewId !== interviewId) continue;
      if (
        latest === null ||
        job.createdAt.getTime() > latest.createdAt.getTime() ||
        (job.createdAt.getTime() === latest.createdAt.getTime() &&
          job.updatedAt.getTime() >= latest.updatedAt.getTime())
      ) {
        latest = job;
      }
    }
    return latest;
  }

  async listPending(): Promise<readonly EvaluationJob[]> {
    return [...this.store.values()]
      .filter((job) => job.status === "pending")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export class InMemoryEventRepository implements EventRepository {
  private readonly events: InterviewEvent[] = [];

  async append(event: InterviewEvent): Promise<void> {
    this.events.push(event);
  }

  // Oldest-first by occurredAt, matching the Drizzle `asc(occurred_at)` read
  // (audit P2-3). Stable sort keeps insertion order for equal timestamps.
  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly InterviewEvent[]> {
    return this.events
      .filter((e) => e.interviewId === interviewId)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  private readonly store = new Map<SubmissionId, CodeSubmission>();

  async save(submission: CodeSubmission): Promise<void> {
    this.store.set(submission.id, submission);
  }

  async findById(id: SubmissionId): Promise<CodeSubmission | null> {
    return this.store.get(id) ?? null;
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly CodeSubmission[]> {
    return [...this.store.values()]
      .filter((s) => s.interviewId === interviewId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export class InMemoryRunRepository implements RunRepository {
  private readonly store = new Map<RunId, CodeRun>();

  async save(run: CodeRun): Promise<void> {
    this.store.set(run.id, run);
  }

  async findById(id: RunId): Promise<CodeRun | null> {
    return this.store.get(id) ?? null;
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly CodeRun[]> {
    return [...this.store.values()]
      .filter((r) => r.interviewId === interviewId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listBySubmission(
    submissionId: SubmissionId,
  ): Promise<readonly CodeRun[]> {
    return [...this.store.values()]
      .filter((r) => r.submissionId === submissionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

// S8c accounts (HLD 7.1): self-registered local credentials. Emails are
// stored normalized (lowercased); lookups must normalize first.
export interface UserRepository {
  save(account: UserAccount): Promise<void>;
  findById(id: UserId): Promise<UserAccount | null>;
  findByEmail(email: string): Promise<UserAccount | null>;
}

// Opaque bearer sessions. Only the token hash is stored; the raw token is
// shown once at login and never persisted anywhere.
export interface SessionRepository {
  save(session: UserSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<UserSession | null>;
  deleteByTokenHash(tokenHash: string): Promise<boolean>;
  deleteByUserId(userId: UserId): Promise<number>;
}

// Learning-loop Phase 2: one profile per user, keyed by user id. Save is an
// upsert (create + edit share the path).
export interface UserProfileRepository {
  save(profile: UserProfile): Promise<void>;
  findByUserId(userId: UserId): Promise<UserProfile | null>;
}

// Learning-loop Phase 3: the curriculum is static seeded config. Save writes
// the whole tree atomically (curriculum + modules + topics + topic problems),
// mirroring InterviewRepository.save; reads reassemble it.
export interface CurriculumRepository {
  save(curriculum: Curriculum): Promise<void>;
  findById(id: CurriculumId): Promise<Curriculum | null>;
  list(): Promise<readonly Curriculum[]>;
}

// Per-user, per-topic mastery. Unique key: (userId, curriculumId, topicId).
export interface UserSkillStateRepository {
  save(state: UserSkillState): Promise<void>;
  findByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<readonly UserSkillState[]>;
  findByTopic(
    userId: UserId,
    curriculumId: CurriculumId,
    topicId: TopicId,
  ): Promise<UserSkillState | null>;
  /** Reset support: delete every row for the user, returning the count. */
  deleteByUser(userId: UserId): Promise<number>;
}

// One progress pointer per (user, curriculum).
export interface UserCurriculumProgressRepository {
  save(progress: UserCurriculumProgress): Promise<void>;
  findByUser(
    userId: UserId,
    curriculumId: CurriculumId,
  ): Promise<UserCurriculumProgress | null>;
  /** Reset support: delete every row for the user, returning the count. */
  deleteByUser(userId: UserId): Promise<number>;
}

// Learning-loop Phase 4: persisted recommendations. `findCurrentByUser` is the
// latest non-superseded proposal (the one the dashboard/lobby act on);
// `listByUser` returns all, newest first (trajectory / Phase 12 supersession).
export interface RecommendationRepository {
  save(recommendation: Recommendation): Promise<void>;
  findById(id: RecommendationId): Promise<Recommendation | null>;
  findCurrentByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<Recommendation | null>;
  listByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<readonly Recommendation[]>;
  /** Reset support: delete every row for the user, returning the count. */
  deleteByUser(userId: UserId): Promise<number>;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<UserId, UserAccount>();

  async save(account: UserAccount): Promise<void> {
    this.store.set(account.id, account);
  }

  async findById(id: UserId): Promise<UserAccount | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    for (const account of this.store.values()) {
      if (account.email === email) return account;
    }
    return null;
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly store = new Map<string, UserSession>();

  async save(session: UserSession): Promise<void> {
    this.store.set(session.tokenHash, session);
  }

  async findByTokenHash(tokenHash: string): Promise<UserSession | null> {
    return this.store.get(tokenHash) ?? null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<boolean> {
    return this.store.delete(tokenHash);
  }

  async deleteByUserId(userId: UserId): Promise<number> {
    let removed = 0;
    for (const [hash, session] of this.store) {
      if (session.userId === userId) {
        this.store.delete(hash);
        removed += 1;
      }
    }
    return removed;
  }
}

export class InMemoryUserProfileRepository implements UserProfileRepository {
  private readonly store = new Map<UserId, UserProfile>();

  async save(profile: UserProfile): Promise<void> {
    this.store.set(profile.userId, profile);
  }

  async findByUserId(userId: UserId): Promise<UserProfile | null> {
    return this.store.get(userId) ?? null;
  }
}

export class InMemoryCurriculumRepository implements CurriculumRepository {
  private readonly store = new Map<CurriculumId, Curriculum>();

  async save(curriculum: Curriculum): Promise<void> {
    this.store.set(curriculum.id, curriculum);
  }

  async findById(id: CurriculumId): Promise<Curriculum | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<readonly Curriculum[]> {
    return [...this.store.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}

export class InMemoryUserSkillStateRepository
  implements UserSkillStateRepository
{
  private readonly store = new Map<string, UserSkillState>();

  private key(userId: UserId, curriculumId: CurriculumId, topicId: TopicId): string {
    return `${userId}\u0000${curriculumId}\u0000${topicId}`;
  }

  async save(state: UserSkillState): Promise<void> {
    this.store.set(this.key(state.userId, state.curriculumId, state.topicId), state);
  }

  async findByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<readonly UserSkillState[]> {
    return [...this.store.values()]
      .filter(
        (s) =>
          s.userId === userId &&
          (curriculumId === undefined || s.curriculumId === curriculumId),
      )
      .sort((a, b) => a.topicId.localeCompare(b.topicId));
  }

  async findByTopic(
    userId: UserId,
    curriculumId: CurriculumId,
    topicId: TopicId,
  ): Promise<UserSkillState | null> {
    return this.store.get(this.key(userId, curriculumId, topicId)) ?? null;
  }

  async deleteByUser(userId: UserId): Promise<number> {
    const prefix = `${userId}\u0000`;
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

export class InMemoryUserCurriculumProgressRepository
  implements UserCurriculumProgressRepository
{
  private readonly store = new Map<string, UserCurriculumProgress>();

  private key(userId: UserId, curriculumId: CurriculumId): string {
    return `${userId}\u0000${curriculumId}`;
  }

  async save(progress: UserCurriculumProgress): Promise<void> {
    this.store.set(this.key(progress.userId, progress.curriculumId), progress);
  }

  async findByUser(
    userId: UserId,
    curriculumId: CurriculumId,
  ): Promise<UserCurriculumProgress | null> {
    return this.store.get(this.key(userId, curriculumId)) ?? null;
  }

  async deleteByUser(userId: UserId): Promise<number> {
    const prefix = `${userId}\u0000`;
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

export class InMemoryRecommendationRepository implements RecommendationRepository {
  private readonly store = new Map<RecommendationId, Recommendation>();

  async save(recommendation: Recommendation): Promise<void> {
    this.store.set(recommendation.id, recommendation);
  }

  async findById(id: RecommendationId): Promise<Recommendation | null> {
    return this.store.get(id) ?? null;
  }

  private byUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Recommendation[] {
    return [...this.store.values()]
      .filter(
        (r) =>
          r.userId === userId &&
          (curriculumId === undefined || r.curriculumId === curriculumId),
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
  }

  async findCurrentByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<Recommendation | null> {
    return this.byUser(userId, curriculumId).find((r) => r.status !== "superseded") ?? null;
  }

  async listByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<readonly Recommendation[]> {
    return this.byUser(userId, curriculumId);
  }

  async deleteByUser(userId: UserId): Promise<number> {
    const owned = [...this.store.values()].filter((r) => r.userId === userId);
    for (const recommendation of owned) this.store.delete(recommendation.id);
    return owned.length;
  }
}

export interface RepositorySet {
  readonly interviews: InterviewRepository;
  readonly problems: ProblemRepository;
  readonly responses: ResponseRepository;
  readonly messages: InterviewMessageRepository;
  readonly evaluations: EvaluationRepository;
  readonly evaluationJobs: EvaluationJobRepository;
  readonly events: EventRepository;
  readonly submissions: SubmissionRepository;
  readonly runs: RunRepository;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly profiles: UserProfileRepository;
  readonly curricula: CurriculumRepository;
  readonly skillStates: UserSkillStateRepository;
  readonly curriculumProgress: UserCurriculumProgressRepository;
  readonly recommendations: RecommendationRepository;
}

export function createInMemoryRepositories(): RepositorySet & {
  readonly interviews: InMemoryInterviewRepository;
  readonly problems: InMemoryProblemRepository;
  readonly responses: InMemoryResponseRepository;
  readonly messages: InMemoryInterviewMessageRepository;
  readonly evaluations: InMemoryEvaluationRepository;
  readonly evaluationJobs: InMemoryEvaluationJobRepository;
  readonly events: InMemoryEventRepository;
  readonly submissions: InMemorySubmissionRepository;
  readonly runs: InMemoryRunRepository;
  readonly users: InMemoryUserRepository;
  readonly sessions: InMemorySessionRepository;
  readonly profiles: InMemoryUserProfileRepository;
  readonly curricula: InMemoryCurriculumRepository;
  readonly skillStates: InMemoryUserSkillStateRepository;
  readonly curriculumProgress: InMemoryUserCurriculumProgressRepository;
  readonly recommendations: InMemoryRecommendationRepository;
} {
  return {
    interviews: new InMemoryInterviewRepository(),
    problems: new InMemoryProblemRepository(),
    responses: new InMemoryResponseRepository(),
    messages: new InMemoryInterviewMessageRepository(),
    evaluations: new InMemoryEvaluationRepository(),
    evaluationJobs: new InMemoryEvaluationJobRepository(),
    events: new InMemoryEventRepository(),
    submissions: new InMemorySubmissionRepository(),
    runs: new InMemoryRunRepository(),
    users: new InMemoryUserRepository(),
    sessions: new InMemorySessionRepository(),
    profiles: new InMemoryUserProfileRepository(),
    curricula: new InMemoryCurriculumRepository(),
    skillStates: new InMemoryUserSkillStateRepository(),
    curriculumProgress: new InMemoryUserCurriculumProgressRepository(),
    recommendations: new InMemoryRecommendationRepository(),
  };
}
