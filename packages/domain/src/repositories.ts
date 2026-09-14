import type {
  EvaluationId,
  InterviewId,
  ProblemId,
  ResponseId,
  RunId,
  SubmissionId,
  UserId,
} from "./ids.js";
import type { UserAccount, UserSession } from "./user.js";
import type { UserProfile } from "./profile.js";
import type { CandidateResponse } from "./candidate-response.js";
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
}

export interface EventRepository {
  append(event: InterviewEvent): Promise<void>;
  listByInterview(interviewId: InterviewId): Promise<readonly InterviewEvent[]>;
}

// S7a sandbox persistence (HLD 6.1/6.3): submissions + runs are
// backend-owned artefacts like responses — persisted separately from raw
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
  // insertion order — the deterministic tie-break Postgres cannot offer.
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

export interface RepositorySet {
  readonly interviews: InterviewRepository;
  readonly problems: ProblemRepository;
  readonly responses: ResponseRepository;
  readonly evaluations: EvaluationRepository;
  readonly events: EventRepository;
  readonly submissions: SubmissionRepository;
  readonly runs: RunRepository;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly profiles: UserProfileRepository;
}

export function createInMemoryRepositories(): RepositorySet & {
  readonly interviews: InMemoryInterviewRepository;
  readonly problems: InMemoryProblemRepository;
  readonly responses: InMemoryResponseRepository;
  readonly evaluations: InMemoryEvaluationRepository;
  readonly events: InMemoryEventRepository;
  readonly submissions: InMemorySubmissionRepository;
  readonly runs: InMemoryRunRepository;
  readonly users: InMemoryUserRepository;
  readonly sessions: InMemorySessionRepository;
  readonly profiles: InMemoryUserProfileRepository;
} {
  return {
    interviews: new InMemoryInterviewRepository(),
    problems: new InMemoryProblemRepository(),
    responses: new InMemoryResponseRepository(),
    evaluations: new InMemoryEvaluationRepository(),
    events: new InMemoryEventRepository(),
    submissions: new InMemorySubmissionRepository(),
    runs: new InMemoryRunRepository(),
    users: new InMemoryUserRepository(),
    sessions: new InMemorySessionRepository(),
    profiles: new InMemoryUserProfileRepository(),
  };
}
