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
} from "@interview-coach/domain";
import type {
  CandidateResponse,
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
} from "@interview-coach/domain";
import type {
  InterviewId,
  ProblemId,
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
            startedAt: interview.startedAt ?? null,
            endedAt: interview.endedAt ?? null,
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
    const rows = await this.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.id, id))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    const assignments = await this.db
      .select()
      .from(schema.interviewProblems)
      .where(eq(schema.interviewProblems.interviewId, id))
      .orderBy(asc(schema.interviewProblems.order));
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

  async list(): Promise<readonly Problem[]> {
    const rows = await this.db.select().from(schema.problems);
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

// Extra: users table access for future auth (S7). Not part of the S1
// RepositorySet — interviews reference candidate IDs without a hard FK.
export class DrizzleUserRepository {
  constructor(private readonly db: Db) {}

  async save(user: { id: string; displayName: string; createdAt: Date }): Promise<void> {
    await this.db
      .insert(schema.users)
      .values({ id: user.id, displayName: user.displayName, createdAt: user.createdAt })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { displayName: user.displayName },
      });
  }

  async findById(
    id: string,
  ): Promise<{ id: string; displayName: string; createdAt: Date } | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    const row = rows[0];
    return row === undefined
      ? null
      : { id: row.id, displayName: row.displayName, createdAt: row.createdAt };
  }
}

export function createDrizzleRepositories(db: Db): RepositorySet {
  return {
    interviews: new DrizzleInterviewRepository(db),
    problems: new DrizzleProblemRepository(db),
    responses: new DrizzleResponseRepository(db),
    evaluations: new DrizzleEvaluationRepository(db),
    events: new DrizzleEventRepository(db),
  };
}
