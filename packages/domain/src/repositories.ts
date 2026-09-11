import type {
  EvaluationId,
  InterviewId,
  ProblemId,
  ResponseId,
  RunId,
  SubmissionId,
} from "./ids.js";
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

  async list(): Promise<readonly Problem[]> {
    return [...this.store.values()];
  }
}

export class InMemoryResponseRepository implements ResponseRepository {
  private readonly store = new Map<ResponseId, CandidateResponse>();

  async append(response: CandidateResponse): Promise<void> {
    this.store.set(response.id, response);
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly CandidateResponse[]> {
    return [...this.store.values()].filter((r) => r.interviewId === interviewId);
  }
}

export class InMemoryEvaluationRepository implements EvaluationRepository {
  private readonly store = new Map<EvaluationId, Evaluation>();

  async save(evaluation: Evaluation): Promise<void> {
    this.store.set(evaluation.id, evaluation);
  }

  async findByInterview(interviewId: InterviewId): Promise<Evaluation | null> {
    for (const evaluation of this.store.values()) {
      if (evaluation.interviewId === interviewId) return evaluation;
    }
    return null;
  }
}

export class InMemoryEventRepository implements EventRepository {
  private readonly events: InterviewEvent[] = [];

  async append(event: InterviewEvent): Promise<void> {
    this.events.push(event);
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly InterviewEvent[]> {
    return this.events.filter((e) => e.interviewId === interviewId);
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

export interface RepositorySet {
  readonly interviews: InterviewRepository;
  readonly problems: ProblemRepository;
  readonly responses: ResponseRepository;
  readonly evaluations: EvaluationRepository;
  readonly events: EventRepository;
  readonly submissions: SubmissionRepository;
  readonly runs: RunRepository;
}

export function createInMemoryRepositories(): RepositorySet & {
  readonly interviews: InMemoryInterviewRepository;
  readonly problems: InMemoryProblemRepository;
  readonly responses: InMemoryResponseRepository;
  readonly evaluations: InMemoryEvaluationRepository;
  readonly events: InMemoryEventRepository;
  readonly submissions: InMemorySubmissionRepository;
  readonly runs: InMemoryRunRepository;
} {
  return {
    interviews: new InMemoryInterviewRepository(),
    problems: new InMemoryProblemRepository(),
    responses: new InMemoryResponseRepository(),
    evaluations: new InMemoryEvaluationRepository(),
    events: new InMemoryEventRepository(),
    submissions: new InMemorySubmissionRepository(),
    runs: new InMemoryRunRepository(),
  };
}
