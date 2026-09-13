// Postgres-backed repositories behind the S1 domain interfaces
// (packages/domain/src/repositories.ts). Same async signatures, so
// InterviewService/ToolService run unchanged on Postgres.
// Transaction boundary: InterviewRepository.save writes the interview row +
// its problem assignments atomically.

import { asc, desc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type {
  EvaluationRepository,
  EventRepository,
  InterviewRepository,
  ProblemRepository,
  RepositorySet,
  ResponseRepository,
  RunRepository,
  SessionRepository,
  SubmissionRepository,
  UserAccount,
  UserRepository,
  UserSession,
} from "@interview-coach/domain";
import type {
  CandidateResponse,
  CodeRun,
  CodeSubmission,
  Evaluation,
  EvaluationRecommendation,
  Interview,
  InterviewConfiguration,
  InterviewEvent,
  InterviewEventType,
  InterviewProblemState,
  InterviewStatus,
  InterviewType,
  Problem,
  ProblemDifficulty,
  ResponseKind,
  RunStatus,
} from "@interview-coach/domain";
import type {
  InterviewId,
  ProblemId,
  RunId,
  SubmissionId,
  UserId,
} from "@interview-coach/domain";
import * as schema from "./schema.js";

type Db = PostgresJsDatabase<typeof schema>;

function toStatus(raw: string): InterviewStatus {
  return raw as InterviewStatus;
}

function toInterviewType(raw: string): InterviewType {
  return raw as InterviewType;
}

function toProblemDifficulty(raw: string): ProblemDifficulty {
  return raw as ProblemDifficulty;
}

function toProblemState(raw: string): InterviewProblemState {
  return raw as InterviewProblemState;
}

function toResponseKind(raw: string): ResponseKind {
  return raw as ResponseKind;
}

// Concurrency (audit P2-1/F9): the MVP is explicitly single-writer — one
// backend replica (frozen §5: no Redis/queues; deployment constraint), and the
// only writers are the request handlers of that process, serialized per
// interview by the voice session. A compare-and-swap is therefore deferred to
// the multi-instance promotion (shared tool_call_records + version column);
// until then `save` is last-write-wins by design, documented here rather than
// silently assumed. Timestamps are preserved on partial updates (audit P2-8).
export class DrizzleInterviewRepository implements InterviewRepository {
  constructor(private readonly db: Db) {}

  async save(interview: Interview): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(schema.interviews)
        .values({
          id: interview.id,
          candidateId: interview.candidateId,
          type: interview.type,
          status: interview.status,
          configuration: {
            interviewType: interview.configuration.interviewType,
            ...(interview.configuration.difficulty === undefined
              ? {}
              : { difficulty: interview.configuration.difficulty }),
            ...(interview.configuration.durationMinutes === undefined
              ? {}
              : { durationMinutes: interview.configuration.durationMinutes }),
            ...(interview.configuration.problemCount === undefined
              ? {}
              : { problemCount: interview.configuration.problemCount }),
            ...(interview.configuration.topicFocus === undefined
              ? {}
              : { topicFocus: [...interview.configuration.topicFocus] }),
          },
          currentOrder: interview.currentOrder,
          createdAt: interview.createdAt,
          updatedAt: interview.updatedAt,
          startedAt: interview.startedAt ?? null,
          endedAt: interview.endedAt ?? null,
        })
        .onConflictDoUpdate({
          target: schema.interviews.id,
          set: {
            candidateId: interview.candidateId,
            type: interview.type,
            status: interview.status,
            configuration: {
              interviewType: interview.configuration.interviewType,
              ...(interview.configuration.difficulty === undefined
                ? {}
                : { difficulty: interview.configuration.difficulty }),
              ...(interview.configuration.durationMinutes === undefined
                ? {}
                : {
                    durationMinutes: interview.configuration.durationMinutes,
                  }),
              ...(interview.configuration.problemCount === undefined
                ? {}
                : { problemCount: interview.configuration.problemCount }),
              ...(interview.configuration.topicFocus === undefined
                ? {}
                : { topicFocus: [...interview.configuration.topicFocus] }),
            },
            currentOrder: interview.currentOrder,
            updatedAt: interview.updatedAt,
            // Preserve existing timestamps when a partial update omits them
            // (audit P2-8); the insert path above still writes nulls.
            ...(interview.startedAt === undefined
              ? {}
              : { startedAt: interview.startedAt }),
            ...(interview.endedAt === undefined ? {} : { endedAt: interview.endedAt }),
          },
        });
      await tx
        .delete(schema.interviewProblems)
        .where(eq(schema.interviewProblems.interviewId, interview.id));
      if (interview.problems.length > 0) {
        await tx.insert(schema.interviewProblems).values(
          interview.problems.map((p) => ({
            interviewId: p.interviewId,
            problemId: p.problemId,
            order: p.order,
            state: p.state,
          })),
        );
      }
    });
  }

  async findById(id: InterviewId): Promise<Interview | null> {
    // Read the interview row + its assignments in one transaction (audit
    // P2-6) so a concurrent save's delete+insert cannot yield a torn read.
    const { rows, assignments } = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.interviews)
        .where(eq(schema.interviews.id, id))
        .limit(1);
      const assignments = await tx
        .select()
        .from(schema.interviewProblems)
        .where(eq(schema.interviewProblems.interviewId, id))
        .orderBy(asc(schema.interviewProblems.order));
      return { rows, assignments };
    });
    const row = rows[0];
    if (row === undefined) return null;
    const rawConfig = row.configuration as {
      interviewType: string;
      difficulty?: "Easy" | "Medium" | "Mixed";
      durationMinutes?: number;
      problemCount?: number;
      topicFocus?: readonly string[];
    };
    const configuration: InterviewConfiguration = {
      interviewType: toInterviewType(rawConfig.interviewType),
      ...(rawConfig.difficulty === undefined
        ? {}
        : { difficulty: rawConfig.difficulty }),
      ...(rawConfig.durationMinutes === undefined
        ? {}
        : { durationMinutes: rawConfig.durationMinutes }),
      ...(rawConfig.problemCount === undefined
        ? {}
        : { problemCount: rawConfig.problemCount }),
      ...(rawConfig.topicFocus === undefined
        ? {}
        : { topicFocus: rawConfig.topicFocus }),
    };
    return {
      id: row.id as InterviewId,
      candidateId: row.candidateId as Interview["candidateId"],
      type: toInterviewType(row.type),
      status: toStatus(row.status),
      configuration,
      problems: assignments.map((a) => ({
        interviewId: a.interviewId as InterviewId,
        problemId: a.problemId as ProblemId,
        order: a.order,
        state: toProblemState(a.state),
      })),
      currentOrder: row.currentOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.startedAt === null ? {} : { startedAt: row.startedAt }),
      ...(row.endedAt === null ? {} : { endedAt: row.endedAt }),
    };
  }

  async deleteById(id: InterviewId): Promise<boolean> {
    // Interview-scoped rows cascade via onDelete (assignments, responses,
    // evaluations, events, submissions, runs); the problem catalog is shared.
    const removed = await this.db
      .delete(schema.interviews)
      .where(eq(schema.interviews.id, id))
      .returning({ id: schema.interviews.id });
    return removed.length > 0;
  }
}

export class DrizzleProblemRepository implements ProblemRepository {
  constructor(private readonly db: Db) {}

  async save(problem: Problem): Promise<void> {
    await this.db
      .insert(schema.problems)
      .values(toProblemRow(problem))
      .onConflictDoUpdate({
        target: schema.problems.id,
        set: toProblemRow(problem),
      });
  }

  async findById(id: ProblemId): Promise<Problem | null> {
    const rows = await this.db
      .select()
      .from(schema.problems)
      .where(eq(schema.problems.id, id))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toProblem(row);
  }

  async findManyByIds(ids: readonly ProblemId[]): Promise<readonly Problem[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(schema.problems)
      .where(inArray(schema.problems.id, [...ids]));
    const byId = new Map(rows.map((r) => [r.id, toProblem(r)]));
    const found: Problem[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (p !== undefined) found.push(p);
    }
    return found;
  }

  // Stable order (audit P2-4): deterministic reads regardless of insert order.
  async list(): Promise<readonly Problem[]> {
    const rows = await this.db
      .select()
      .from(schema.problems)
      .orderBy(asc(schema.problems.title));
    return rows.map(toProblem);
  }
}

type ProblemRow = typeof schema.problems.$inferSelect;

function toProblemRow(problem: Problem) {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    description: problem.description ?? null,
    constraints: problem.constraints === undefined ? null : [...problem.constraints],
    examples:
      problem.examples === undefined
        ? null
        : problem.examples.map((e) => ({ ...e })),
    expectedConcepts:
      problem.expectedConcepts === undefined ? null : [...problem.expectedConcepts],
    sourceLinks: problem.sourceLinks === undefined ? null : { ...problem.sourceLinks },
    evaluationCriteria:
      problem.evaluationCriteria === undefined
        ? null
        : [...problem.evaluationCriteria],
  };
}

function toProblem(row: ProblemRow): Problem {
  return {
    id: row.id as ProblemId,
    title: row.title,
    difficulty: toProblemDifficulty(row.difficulty),
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.constraints === null ? {} : { constraints: row.constraints }),
    ...(row.examples === null ? {} : { examples: row.examples }),
    ...(row.expectedConcepts === null
      ? {}
      : { expectedConcepts: row.expectedConcepts }),
    ...(row.sourceLinks === null ? {} : { sourceLinks: row.sourceLinks }),
    ...(row.evaluationCriteria === null
      ? {}
      : { evaluationCriteria: row.evaluationCriteria }),
  };
}

export class DrizzleResponseRepository implements ResponseRepository {
  constructor(private readonly db: Db) {}

  async append(response: CandidateResponse): Promise<void> {
    await this.db
      .insert(schema.candidateResponses)
      .values({
        id: response.id,
        interviewId: response.interviewId,
        problemId: response.problemId ?? null,
        kind: response.kind,
        content: response.content,
        createdAt: response.createdAt,
      })
      .onConflictDoNothing({ target: schema.candidateResponses.id });
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly CandidateResponse[]> {
    const rows = await this.db
      .select()
      .from(schema.candidateResponses)
      .where(eq(schema.candidateResponses.interviewId, interviewId))
      .orderBy(asc(schema.candidateResponses.createdAt));
    return rows.map(
      (r): CandidateResponse => ({
        id: r.id as CandidateResponse["id"],
        interviewId: r.interviewId as InterviewId,
        kind: toResponseKind(r.kind),
        content: r.content,
        createdAt: r.createdAt,
        ...(r.problemId === null ? {} : { problemId: r.problemId as ProblemId }),
      }),
    );
  }
}

export class DrizzleEvaluationRepository implements EvaluationRepository {
  constructor(private readonly db: Db) {}

  async save(evaluation: Evaluation): Promise<void> {
    const values = {
      id: evaluation.id,
      interviewId: evaluation.interviewId,
      dimensions: { ...evaluation.dimensions } as Evaluation["dimensions"],
      hintsUsed: evaluation.hintsUsed,
      strengths: [...evaluation.strengths],
      weaknesses: [...evaluation.weaknesses],
      recommendation: evaluation.recommendation ?? null,
      overallScore: evaluation.overallScore ?? null,
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt,
    };
    await this.db
      .insert(schema.evaluations)
      .values(values)
      .onConflictDoUpdate({ target: schema.evaluations.id, set: values });
  }

  async findByInterview(
    interviewId: InterviewId,
  ): Promise<Evaluation | null> {
    const rows = await this.db
      .select()
      .from(schema.evaluations)
      .where(eq(schema.evaluations.interviewId, interviewId))
      .orderBy(desc(schema.evaluations.createdAt))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    const dimensions = row.dimensions as Evaluation["dimensions"];
    return {
      id: row.id as Evaluation["id"],
      interviewId: row.interviewId as InterviewId,
      dimensions,
      hintsUsed: row.hintsUsed,
      strengths: row.strengths,
      weaknesses: row.weaknesses,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.recommendation === null
        ? {}
        : { recommendation: row.recommendation as EvaluationRecommendation }),
      ...(row.overallScore === null ? {} : { overallScore: row.overallScore }),
    };
  }
}

export class DrizzleEventRepository implements EventRepository {
  constructor(private readonly db: Db) {}

  async append(event: InterviewEvent): Promise<void> {
    await this.db
      .insert(schema.interviewEvents)
      .values({
        id: event.id,
        interviewId: event.interviewId,
        type: event.type,
        payload: event.payload === undefined ? null : { ...event.payload },
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing({ target: schema.interviewEvents.id });
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly InterviewEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.interviewEvents)
      .where(eq(schema.interviewEvents.interviewId, interviewId))
      .orderBy(asc(schema.interviewEvents.occurredAt));
    return rows.map(
      (r): InterviewEvent => ({
        id: r.id as InterviewEvent["id"],
        interviewId: r.interviewId as InterviewId,
        type: r.type as InterviewEventType,
        occurredAt: r.occurredAt,
        ...(r.payload === null ? {} : { payload: r.payload }),
      }),
    );
  }
}

// S7a sandbox repos: submissions + runs behind the domain interfaces.
// Upserts keep replay/seed flows safe; reads order oldest-first to match the
// in-memory implementations.
export class DrizzleSubmissionRepository implements SubmissionRepository {
  constructor(private readonly db: Db) {}

  async save(submission: CodeSubmission): Promise<void> {
    const values = {
      id: submission.id,
      interviewId: submission.interviewId,
      problemId: submission.problemId ?? null,
      language: submission.language,
      code: submission.code,
      createdAt: submission.createdAt,
    };
    await this.db
      .insert(schema.submissions)
      .values(values)
      .onConflictDoUpdate({ target: schema.submissions.id, set: values });
  }

  async findById(id: SubmissionId): Promise<CodeSubmission | null> {
    const rows = await this.db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, id))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id as SubmissionId,
      interviewId: row.interviewId as InterviewId,
      language: row.language as CodeSubmission["language"],
      code: row.code,
      createdAt: row.createdAt,
      ...(row.problemId === null ? {} : { problemId: row.problemId as ProblemId }),
    };
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly CodeSubmission[]> {
    const rows = await this.db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.interviewId, interviewId))
      .orderBy(asc(schema.submissions.createdAt));
    return rows.map(
      (row): CodeSubmission => ({
        id: row.id as SubmissionId,
        interviewId: row.interviewId as InterviewId,
        language: row.language as CodeSubmission["language"],
        code: row.code,
        createdAt: row.createdAt,
        ...(row.problemId === null
          ? {}
          : { problemId: row.problemId as ProblemId }),
      }),
    );
  }
}

export class DrizzleRunRepository implements RunRepository {
  constructor(private readonly db: Db) {}

  async save(run: CodeRun): Promise<void> {
    const values = {
      id: run.id,
      submissionId: run.submissionId,
      interviewId: run.interviewId,
      status: run.status,
      results: [...run.results],
      passedCount: run.passedCount,
      totalCount: run.totalCount,
      durationMs: run.durationMs,
      createdAt: run.createdAt,
    };
    await this.db
      .insert(schema.codeRuns)
      .values(values)
      .onConflictDoUpdate({ target: schema.codeRuns.id, set: values });
  }

  async findById(id: RunId): Promise<CodeRun | null> {
    const rows = await this.db
      .select()
      .from(schema.codeRuns)
      .where(eq(schema.codeRuns.id, id))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toCodeRun(row);
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly CodeRun[]> {
    const rows = await this.db
      .select()
      .from(schema.codeRuns)
      .where(eq(schema.codeRuns.interviewId, interviewId))
      .orderBy(asc(schema.codeRuns.createdAt));
    return rows.map(toCodeRun);
  }

  async listBySubmission(
    submissionId: SubmissionId,
  ): Promise<readonly CodeRun[]> {
    const rows = await this.db
      .select()
      .from(schema.codeRuns)
      .where(eq(schema.codeRuns.submissionId, submissionId))
      .orderBy(asc(schema.codeRuns.createdAt));
    return rows.map(toCodeRun);
  }
}

type CodeRunRow = typeof schema.codeRuns.$inferSelect;

function toCodeRun(row: CodeRunRow): CodeRun {
  return {
    id: row.id as RunId,
    submissionId: row.submissionId as SubmissionId,
    interviewId: row.interviewId as InterviewId,
    status: row.status as RunStatus,
    results: row.results,
    passedCount: row.passedCount,
    totalCount: row.totalCount,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  };
}

// S8c accounts (HLD 7.1): local credentials behind the domain
// UserRepository/SessionRepository contracts. Emails are stored normalized;
// passwordHash/tokenHash formats are owned by the backend hasher.
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async save(account: UserAccount): Promise<void> {
    await this.db
      .insert(schema.users)
      .values({
        id: account.id,
        displayName: account.displayName,
        email: account.email,
        passwordHash: account.passwordHash,
        createdAt: account.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          displayName: account.displayName,
          email: account.email,
          passwordHash: account.passwordHash,
        },
      });
  }

  async findById(id: UserId): Promise<UserAccount | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return toAccount(rows[0] ?? null);
  }

  async findByEmail(email: string): Promise<UserAccount | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return toAccount(rows[0] ?? null);
  }
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: Db) {}

  async save(session: UserSession): Promise<void> {
    await this.db
      .insert(schema.userSessions)
      .values({
        tokenHash: session.tokenHash,
        userId: session.userId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })
      .onConflictDoNothing();
  }

  async findByTokenHash(tokenHash: string): Promise<UserSession | null> {
    const rows = await this.db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      tokenHash: row.tokenHash,
      userId: row.userId as UserId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }

  async deleteByTokenHash(tokenHash: string): Promise<boolean> {
    const removed = await this.db
      .delete(schema.userSessions)
      .where(eq(schema.userSessions.tokenHash, tokenHash))
      .returning({ tokenHash: schema.userSessions.tokenHash });
    return removed.length > 0;
  }

  async deleteByUserId(userId: UserId): Promise<number> {
    const removed = await this.db
      .delete(schema.userSessions)
      .where(eq(schema.userSessions.userId, userId))
      .returning({ tokenHash: schema.userSessions.tokenHash });
    return removed.length;
  }
}

function toAccount(
  row: typeof schema.users.$inferSelect | null,
): UserAccount | null {
  // Pre-S8c rows have no credentials and are invisible to auth flows.
  if (row === null || row.email === null || row.passwordHash === null) return null;
  return {
    id: row.id as UserId,
    email: row.email,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
  };
}

export function createDrizzleRepositories(db: Db): RepositorySet {
  return {
    interviews: new DrizzleInterviewRepository(db),
    problems: new DrizzleProblemRepository(db),
    responses: new DrizzleResponseRepository(db),
    evaluations: new DrizzleEvaluationRepository(db),
    events: new DrizzleEventRepository(db),
    submissions: new DrizzleSubmissionRepository(db),
    runs: new DrizzleRunRepository(db),
    users: new DrizzleUserRepository(db),
    sessions: new DrizzleSessionRepository(db),
  };
}
