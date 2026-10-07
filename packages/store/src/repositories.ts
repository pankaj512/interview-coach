// Postgres-backed repositories behind the S1 domain interfaces
// (packages/core/src/repositories.ts). Same async signatures, so
// InterviewService/ToolService run unchanged on Postgres.
// Transaction boundary: InterviewRepository.save writes the interview row +
// its problem assignments atomically.

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type {
  EvaluationRepository,
  EvaluationJobRepository,
  EventRepository,
  InterviewRepository,
  InterviewMessageRepository,
  ProblemRepository,
  RepositorySet,
  ResponseRepository,
  RunRepository,
  SessionRepository,
  SubmissionRepository,
  UserAccount,
  UserProfile,
  UserProfileRepository,
  UserRepository,
  UserSession,
  CurriculumRepository,
  UserSkillStateRepository,
  UserCurriculumProgressRepository,
  RecommendationRepository,
  Curriculum,
  CurriculumModule,
  CurriculumTopic,
  Recommendation,
  UserCurriculumProgress,
  UserSkillState,
} from "@interview-coach/core";
import type {
  CandidateResponse,
  CodeRun,
  CodeSubmission,
  Evaluation,
  EvaluationJob,
  EvaluationRecommendation,
  EvaluationStatus,
  Interview,
  InterviewConfiguration,
  InterviewEvent,
  InterviewEventType,
  InterviewMessage,
  InterviewProblemState,
  InterviewStatus,
  InterviewType,
  MasteryLevel,
  Problem,
  ProblemDifficulty,
  ProfileLevel,
  ProfileRole,
  RecommendationSource,
  RecommendationStatus,
  RecommendationType,
  ResponseKind,
  RunStatus,
  SkillOutcome,
} from "@interview-coach/core";
import type {
  CurriculumId,
  EvaluationId,
  EvaluationJobId,
  InterviewId,
  ModuleId,
  ProblemId,
  RecommendationId,
  RunId,
  SubmissionId,
  TopicId,
  UserId,
} from "@interview-coach/core";
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

type InterviewRow = typeof schema.interviews.$inferSelect;
type InterviewAssignmentRow = typeof schema.interviewProblems.$inferSelect;

// Single interview-configuration mapper (audit F-20): the insert values and
// the onConflictDoUpdate set share it so a configuration field is a
// one-place edit.
function toConfigurationColumn(
  configuration: InterviewConfiguration,
): typeof schema.interviews.$inferInsert.configuration {
  return {
    interviewType: configuration.interviewType,
    ...(configuration.difficulty === undefined ? {} : { difficulty: configuration.difficulty }),
    ...(configuration.durationMinutes === undefined ? {} : { durationMinutes: configuration.durationMinutes }),
    ...(configuration.problemCount === undefined ? {} : { problemCount: configuration.problemCount }),
    ...(configuration.topicFocus === undefined ? {} : { topicFocus: [...configuration.topicFocus] }),
  };
}

// Shared interview row -> domain mapper (findById + listByCandidate).
function toInterview(
  row: InterviewRow,
  assignments: readonly InterviewAssignmentRow[],
): Interview {
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
    ...(row.recommendationId === null
      ? {}
      : { recommendationId: row.recommendationId as RecommendationId }),
    ...(row.topicId === null ? {} : { topicId: row.topicId as TopicId }),
    evaluationStatus: row.evaluationStatus as EvaluationStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.startedAt === null ? {} : { startedAt: row.startedAt }),
    ...(row.endedAt === null ? {} : { endedAt: row.endedAt }),
  };
}

// Concurrency (audit P2-1/F9): the MVP is explicitly single-writer - one
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
          configuration: toConfigurationColumn(interview.configuration),
          currentOrder: interview.currentOrder,
          recommendationId: interview.recommendationId ?? null,
          topicId: interview.topicId ?? null,
          evaluationStatus: interview.evaluationStatus,
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
            configuration: toConfigurationColumn(interview.configuration),
            currentOrder: interview.currentOrder,
            recommendationId: interview.recommendationId ?? null,
            topicId: interview.topicId ?? null,
            evaluationStatus: interview.evaluationStatus,
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
    return toInterview(row, assignments);
  }

  // Phase 9 history listing: newest first by updatedAt. Assignments are read
  // in one query for the whole page (no N+1).
  async listByCandidate(
    candidateId: UserId,
    limit = 50,
  ): Promise<readonly Interview[]> {
    const rows = await this.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.candidateId, candidateId))
      .orderBy(desc(schema.interviews.updatedAt))
      .limit(limit);
    if (rows.length === 0) return [];
    const assignments = await this.db
      .select()
      .from(schema.interviewProblems)
      .where(
        inArray(
          schema.interviewProblems.interviewId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(schema.interviewProblems.order));
    const byInterview = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const list = byInterview.get(assignment.interviewId) ?? [];
      list.push(assignment);
      byInterview.set(assignment.interviewId, list);
    }
    return rows.map((row) => toInterview(row, byInterview.get(row.id) ?? []));
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
    topicId: problem.topicId ?? null,
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
    starters: problem.starters === undefined ? null : { ...problem.starters },
    runnerLinks:
      problem.runnerLinks === undefined
        ? null
        : {
            ...(problem.runnerLinks.python === undefined
              ? {}
              : { python: { ...problem.runnerLinks.python } }),
            ...(problem.runnerLinks.javascript === undefined
              ? {}
              : { javascript: { ...problem.runnerLinks.javascript } }),
            ...(problem.runnerLinks.cpp === undefined
              ? {}
              : { cpp: { ...problem.runnerLinks.cpp } }),
          },
  };
}

function toProblem(row: ProblemRow): Problem {
  return {
    id: row.id as ProblemId,
    title: row.title,
    difficulty: toProblemDifficulty(row.difficulty),
    ...(row.topicId === null ? {} : { topicId: row.topicId as TopicId }),
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
    ...(row.starters === null ? {} : { starters: row.starters }),
    ...(row.runnerLinks === null ? {} : { runnerLinks: row.runnerLinks }),
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

export class DrizzleInterviewMessageRepository implements InterviewMessageRepository {
  constructor(private readonly db: Db) {}

  async append(message: InterviewMessage): Promise<void> {
    await this.db
      .insert(schema.interviewMessages)
      .values({
        id: message.id,
        interviewId: message.interviewId,
        role: message.role,
        content: message.content,
        problemId: message.problemId ?? null,
        createdAt: message.createdAt,
      })
      .onConflictDoNothing({ target: schema.interviewMessages.id });
  }

  async listByInterview(
    interviewId: InterviewId,
  ): Promise<readonly InterviewMessage[]> {
    const rows = await this.db
      .select()
      .from(schema.interviewMessages)
      .where(eq(schema.interviewMessages.interviewId, interviewId))
      .orderBy(asc(schema.interviewMessages.createdAt));
    return rows.map(
      (r): InterviewMessage => ({
        id: r.id as InterviewMessage["id"],
        interviewId: r.interviewId as InterviewId,
        role: r.role as InterviewMessage["role"],
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
      topicId: evaluation.topicId ?? null,
      status: evaluation.status,
      source: evaluation.source ?? null,
      jobId: evaluation.jobId ?? null,
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
    return row === undefined ? null : toEvaluation(row);
  }

  // Phase 9: latest evaluation per interview for the history page.
  async listByInterviewIds(
    interviewIds: readonly InterviewId[],
  ): Promise<readonly Evaluation[]> {
    if (interviewIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(schema.evaluations)
      .where(inArray(schema.evaluations.interviewId, interviewIds))
      .orderBy(desc(schema.evaluations.createdAt));
    const latest = new Map<string, Evaluation>();
    for (const row of rows) {
      if (!latest.has(row.interviewId)) latest.set(row.interviewId, toEvaluation(row));
    }
    return [...latest.values()];
  }
}

function toEvaluation(row: typeof schema.evaluations.$inferSelect): Evaluation {
  const dimensions = row.dimensions as Evaluation["dimensions"];
  return {
    id: row.id as Evaluation["id"],
    interviewId: row.interviewId as InterviewId,
    status: row.status as Evaluation["status"],
    dimensions,
    hintsUsed: row.hintsUsed,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.topicId === null ? {} : { topicId: row.topicId as TopicId }),
    ...(row.source === null
      ? {}
      : { source: row.source as NonNullable<Evaluation["source"]> }),
    ...(row.jobId === null
      ? {}
      : { jobId: row.jobId as NonNullable<Evaluation["jobId"]> }),
    ...(row.recommendation === null
      ? {}
      : { recommendation: row.recommendation as EvaluationRecommendation }),
    ...(row.overallScore === null ? {} : { overallScore: row.overallScore }),
  };
}

export class DrizzleEvaluationJobRepository implements EvaluationJobRepository {
  constructor(private readonly db: Db) {}

  async save(job: EvaluationJob): Promise<void> {
    const values = {
      id: job.id,
      interviewId: job.interviewId,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
    };
    await this.db
      .insert(schema.evaluationJobs)
      .values(values)
      .onConflictDoUpdate({ target: schema.evaluationJobs.id, set: values });
  }

  async findById(id: EvaluationJobId): Promise<EvaluationJob | null> {
    const rows = await this.db
      .select()
      .from(schema.evaluationJobs)
      .where(eq(schema.evaluationJobs.id, id))
      .limit(1);
    return rows[0] === undefined ? null : toEvaluationJob(rows[0]);
  }

  async findByInterview(interviewId: InterviewId): Promise<EvaluationJob | null> {
    const rows = await this.db
      .select()
      .from(schema.evaluationJobs)
      .where(eq(schema.evaluationJobs.interviewId, interviewId))
      .orderBy(desc(schema.evaluationJobs.createdAt), desc(schema.evaluationJobs.updatedAt))
      .limit(1);
    return rows[0] === undefined ? null : toEvaluationJob(rows[0]);
  }

  async listPending(): Promise<readonly EvaluationJob[]> {
    const rows = await this.db
      .select()
      .from(schema.evaluationJobs)
      .where(eq(schema.evaluationJobs.status, "pending"))
      .orderBy(asc(schema.evaluationJobs.createdAt));
    return rows.map(toEvaluationJob);
  }
}

function toEvaluationJob(row: typeof schema.evaluationJobs.$inferSelect): EvaluationJob {
  return {
    id: row.id as EvaluationJob["id"],
    interviewId: row.interviewId as InterviewId,
    status: row.status as EvaluationJob["status"],
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.lastError === null ? {} : { lastError: row.lastError }),
    ...(row.startedAt === null ? {} : { startedAt: row.startedAt }),
    ...(row.completedAt === null ? {} : { completedAt: row.completedAt }),
  };
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

// Learning-loop Phase 2: one profile row per user; save is an upsert.
export class DrizzleUserProfileRepository implements UserProfileRepository {
  constructor(private readonly db: Db) {}

  async save(profile: UserProfile): Promise<void> {
    await this.db
      .insert(schema.userProfiles)
      .values({
        userId: profile.userId,
        interviewTypes: [...profile.interviewTypes],
        role: profile.role,
        level: profile.level,
        goals: profile.goals ?? null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.userProfiles.userId,
        set: {
          interviewTypes: [...profile.interviewTypes],
          role: profile.role,
          level: profile.level,
          goals: profile.goals ?? null,
          updatedAt: profile.updatedAt,
        },
      });
  }

  async findByUserId(userId: UserId): Promise<UserProfile | null> {
    const rows = await this.db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      userId: row.userId as UserId,
      interviewTypes: row.interviewTypes as readonly InterviewType[],
      role: row.role as ProfileRole,
      level: row.level as ProfileLevel,
      ...(row.goals === null ? {} : { goals: row.goals }),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// Learning-loop Phase 3: static curriculum tree behind the domain contract.
// `save` replaces the curriculum's modules/topics/topic-problems atomically
// (idempotent re-seed); user progress is intentionally not FK-linked to
// curriculum_topics, so replacing the tree never touches user state.
export class DrizzleCurriculumRepository implements CurriculumRepository {
  constructor(private readonly db: Db) {}

  async save(curriculum: Curriculum): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(schema.curricula)
        .values({
          id: curriculum.id,
          interviewType: curriculum.interviewType,
          name: curriculum.name,
          version: curriculum.version,
        })
        .onConflictDoUpdate({
          target: schema.curricula.id,
          set: {
            interviewType: curriculum.interviewType,
            name: curriculum.name,
            version: curriculum.version,
          },
        });
      // Children first; deleting topics cascades topic-problem rows.
      await tx
        .delete(schema.curriculumTopics)
        .where(eq(schema.curriculumTopics.curriculumId, curriculum.id));
      await tx
        .delete(schema.curriculumModules)
        .where(eq(schema.curriculumModules.curriculumId, curriculum.id));

      if (curriculum.modules.length > 0) {
        await tx.insert(schema.curriculumModules).values(
          curriculum.modules.map((module) => ({
            id: module.id,
            curriculumId: module.curriculumId,
            order: module.order,
            name: module.name,
            objective: module.objective ?? null,
          })),
        );
      }
      if (curriculum.topics.length > 0) {
        await tx.insert(schema.curriculumTopics).values(
          curriculum.topics.map((topic) => ({
            id: topic.id,
            curriculumId: topic.curriculumId,
            moduleId: topic.moduleId,
            order: topic.order,
            name: topic.name,
          })),
        );
        const rows = curriculum.topics.flatMap((topic) =>
          topic.problemIds.map((problemId, index) => ({
            topicId: topic.id,
            problemId,
            order: index + 1,
          })),
        );
        if (rows.length > 0) {
          await tx.insert(schema.curriculumTopicProblems).values(rows);
        }
      }
    });
  }

  async findById(id: CurriculumId): Promise<Curriculum | null> {
    const rows = await this.db
      .select()
      .from(schema.curricula)
      .where(eq(schema.curricula.id, id))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;

    const moduleRows = await this.db
      .select()
      .from(schema.curriculumModules)
      .where(eq(schema.curriculumModules.curriculumId, id))
      .orderBy(asc(schema.curriculumModules.order));
    const topicRows = await this.db
      .select()
      .from(schema.curriculumTopics)
      .where(eq(schema.curriculumTopics.curriculumId, id))
      .orderBy(asc(schema.curriculumTopics.order));

    const topicIds = topicRows.map((t) => t.id);
    const problemRows =
      topicIds.length === 0
        ? []
        : await this.db
            .select()
            .from(schema.curriculumTopicProblems)
            .where(inArray(schema.curriculumTopicProblems.topicId, topicIds))
            .orderBy(
              asc(schema.curriculumTopicProblems.topicId),
              asc(schema.curriculumTopicProblems.order),
            );
    const problemsByTopic = new Map<string, ProblemId[]>();
    for (const problem of problemRows) {
      const list = problemsByTopic.get(problem.topicId) ?? [];
      list.push(problem.problemId as ProblemId);
      problemsByTopic.set(problem.topicId, list);
    }

    const topics: CurriculumTopic[] = topicRows.map((topic) => ({
      id: topic.id as TopicId,
      curriculumId: row.id as CurriculumId,
      moduleId: topic.moduleId as ModuleId,
      order: topic.order,
      name: topic.name,
      problemIds: problemsByTopic.get(topic.id) ?? [],
    }));
    const modules: CurriculumModule[] = moduleRows.map((module) => ({
      id: module.id as ModuleId,
      curriculumId: row.id as CurriculumId,
      order: module.order,
      name: module.name,
      ...(module.objective === null ? {} : { objective: module.objective }),
      topicIds: topics
        .filter((topic) => topic.moduleId === module.id)
        .map((topic) => topic.id),
    }));

    return {
      id: row.id as CurriculumId,
      interviewType: toInterviewType(row.interviewType),
      name: row.name,
      version: row.version,
      modules,
      topics,
    };
  }

  async list(): Promise<readonly Curriculum[]> {
    const rows = await this.db
      .select({ id: schema.curricula.id })
      .from(schema.curricula)
      .orderBy(asc(schema.curricula.id));
    const out: Curriculum[] = [];
    for (const row of rows) {
      const curriculum = await this.findById(row.id as CurriculumId);
      if (curriculum !== null) out.push(curriculum);
    }
    return out;
  }
}

type UserSkillStateRow = typeof schema.userSkillStates.$inferSelect;

function toUserSkillState(row: UserSkillStateRow): UserSkillState {
  return {
    userId: row.userId as UserId,
    curriculumId: row.curriculumId as CurriculumId,
    topicId: row.topicId as TopicId,
    masteryLevel: row.masteryLevel as MasteryLevel,
    successfulAttempts: row.successfulAttempts,
    totalAttempts: row.totalAttempts,
    ...(row.lastAttemptAt === null ? {} : { lastAttemptAt: row.lastAttemptAt }),
    ...(row.lastOutcome === null
      ? {}
      : { lastOutcome: row.lastOutcome as SkillOutcome }),
    ...(row.lastEvaluationId === null
      ? {}
      : { lastEvaluationId: row.lastEvaluationId as EvaluationId }),
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleUserSkillStateRepository
  implements UserSkillStateRepository
{
  constructor(private readonly db: Db) {}

  async save(state: UserSkillState): Promise<void> {
    const values = {
      userId: state.userId,
      curriculumId: state.curriculumId,
      topicId: state.topicId,
      masteryLevel: state.masteryLevel,
      successfulAttempts: state.successfulAttempts,
      totalAttempts: state.totalAttempts,
      lastAttemptAt: state.lastAttemptAt ?? null,
      lastOutcome: state.lastOutcome ?? null,
      lastEvaluationId: state.lastEvaluationId ?? null,
      strengths: [...state.strengths],
      weaknesses: [...state.weaknesses],
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
    await this.db
      .insert(schema.userSkillStates)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.userSkillStates.userId,
          schema.userSkillStates.curriculumId,
          schema.userSkillStates.topicId,
        ],
        set: {
          masteryLevel: values.masteryLevel,
          successfulAttempts: values.successfulAttempts,
          totalAttempts: values.totalAttempts,
          lastAttemptAt: values.lastAttemptAt,
          lastOutcome: values.lastOutcome,
          lastEvaluationId: values.lastEvaluationId,
          strengths: values.strengths,
          weaknesses: values.weaknesses,
          updatedAt: values.updatedAt,
        },
      });
  }

  async findByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<readonly UserSkillState[]> {
    const rows = await this.db
      .select()
      .from(schema.userSkillStates)
      .where(
        curriculumId === undefined
          ? eq(schema.userSkillStates.userId, userId)
          : and(
              eq(schema.userSkillStates.userId, userId),
              eq(schema.userSkillStates.curriculumId, curriculumId),
            ),
      )
      .orderBy(asc(schema.userSkillStates.topicId));
    return rows.map(toUserSkillState);
  }

  async findByTopic(
    userId: UserId,
    curriculumId: CurriculumId,
    topicId: TopicId,
  ): Promise<UserSkillState | null> {
    const rows = await this.db
      .select()
      .from(schema.userSkillStates)
      .where(
        and(
          eq(schema.userSkillStates.userId, userId),
          eq(schema.userSkillStates.curriculumId, curriculumId),
          eq(schema.userSkillStates.topicId, topicId),
        ),
      )
      .limit(1);
    return rows[0] === undefined ? null : toUserSkillState(rows[0]);
  }

  async deleteByUser(userId: UserId): Promise<number> {
    const removed = await this.db
      .delete(schema.userSkillStates)
      .where(eq(schema.userSkillStates.userId, userId))
      .returning({ userId: schema.userSkillStates.userId });
    return removed.length;
  }
}

type UserCurriculumProgressRow = typeof schema.userCurriculumProgress.$inferSelect;

function toUserCurriculumProgress(
  row: UserCurriculumProgressRow,
): UserCurriculumProgress {
  return {
    userId: row.userId as UserId,
    curriculumId: row.curriculumId as CurriculumId,
    ...(row.currentTopicId === null
      ? {}
      : { currentTopicId: row.currentTopicId as TopicId }),
    completedTopicIds: row.completedTopicIds.map((id) => id as TopicId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleUserCurriculumProgressRepository
  implements UserCurriculumProgressRepository
{
  constructor(private readonly db: Db) {}

  async save(progress: UserCurriculumProgress): Promise<void> {
    const values = {
      userId: progress.userId,
      curriculumId: progress.curriculumId,
      currentTopicId: progress.currentTopicId ?? null,
      completedTopicIds: [...progress.completedTopicIds],
      createdAt: progress.createdAt,
      updatedAt: progress.updatedAt,
    };
    await this.db
      .insert(schema.userCurriculumProgress)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.userCurriculumProgress.userId,
          schema.userCurriculumProgress.curriculumId,
        ],
        set: {
          currentTopicId: values.currentTopicId,
          completedTopicIds: values.completedTopicIds,
          updatedAt: values.updatedAt,
        },
      });
  }

  async findByUser(
    userId: UserId,
    curriculumId: CurriculumId,
  ): Promise<UserCurriculumProgress | null> {
    const rows = await this.db
      .select()
      .from(schema.userCurriculumProgress)
      .where(
        and(
          eq(schema.userCurriculumProgress.userId, userId),
          eq(schema.userCurriculumProgress.curriculumId, curriculumId),
        ),
      )
      .limit(1);
    return rows[0] === undefined ? null : toUserCurriculumProgress(rows[0]);
  }

  async deleteByUser(userId: UserId): Promise<number> {
    const removed = await this.db
      .delete(schema.userCurriculumProgress)
      .where(eq(schema.userCurriculumProgress.userId, userId))
      .returning({ userId: schema.userCurriculumProgress.userId });
    return removed.length;
  }
}

type RecommendationRow = typeof schema.recommendations.$inferSelect;

function toRecommendation(row: RecommendationRow): Recommendation {
  return {
    id: row.id as RecommendationId,
    userId: row.userId as UserId,
    curriculumId: row.curriculumId as CurriculumId,
    recommendationType: row.recommendationType as RecommendationType,
    topicId: row.topicId as TopicId,
    problemId: row.problemId as ProblemId,
    reason: row.reason,
    source: row.source as RecommendationSource,
    status: row.status as RecommendationStatus,
    ...(row.acceptedAt === null ? {} : { acceptedAt: row.acceptedAt }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleRecommendationRepository implements RecommendationRepository {
  constructor(private readonly db: Db) {}

  async save(recommendation: Recommendation): Promise<void> {
    const values = {
      id: recommendation.id,
      userId: recommendation.userId,
      curriculumId: recommendation.curriculumId,
      recommendationType: recommendation.recommendationType,
      topicId: recommendation.topicId,
      problemId: recommendation.problemId,
      reason: recommendation.reason,
      source: recommendation.source,
      status: recommendation.status,
      acceptedAt: recommendation.acceptedAt ?? null,
      createdAt: recommendation.createdAt,
      updatedAt: recommendation.updatedAt,
    };
    await this.db
      .insert(schema.recommendations)
      .values(values)
      .onConflictDoUpdate({
        target: schema.recommendations.id,
        set: {
          reason: values.reason,
          source: values.source,
          status: values.status,
          acceptedAt: values.acceptedAt,
          updatedAt: values.updatedAt,
        },
      });
  }

  async findById(id: RecommendationId): Promise<Recommendation | null> {
    const rows = await this.db
      .select()
      .from(schema.recommendations)
      .where(eq(schema.recommendations.id, id))
      .limit(1);
    return rows[0] === undefined ? null : toRecommendation(rows[0]);
  }

  async findCurrentByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<Recommendation | null> {
    const rows = await this.db
      .select()
      .from(schema.recommendations)
      .where(
        and(
          eq(schema.recommendations.userId, userId),
          ne(schema.recommendations.status, "superseded"),
          ...(curriculumId === undefined
            ? []
            : [eq(schema.recommendations.curriculumId, curriculumId)]),
        ),
      )
      .orderBy(desc(schema.recommendations.createdAt), desc(schema.recommendations.updatedAt))
      .limit(1);
    return rows[0] === undefined ? null : toRecommendation(rows[0]);
  }

  async listByUser(
    userId: UserId,
    curriculumId?: CurriculumId,
  ): Promise<readonly Recommendation[]> {
    const rows = await this.db
      .select()
      .from(schema.recommendations)
      .where(
        and(
          eq(schema.recommendations.userId, userId),
          ...(curriculumId === undefined
            ? []
            : [eq(schema.recommendations.curriculumId, curriculumId)]),
        ),
      )
      .orderBy(desc(schema.recommendations.createdAt), desc(schema.recommendations.updatedAt));
    return rows.map(toRecommendation);
  }

  async deleteByUser(userId: UserId): Promise<number> {
    const removed = await this.db
      .delete(schema.recommendations)
      .where(eq(schema.recommendations.userId, userId))
      .returning({ id: schema.recommendations.id });
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
    messages: new DrizzleInterviewMessageRepository(db),
    evaluations: new DrizzleEvaluationRepository(db),
    evaluationJobs: new DrizzleEvaluationJobRepository(db),
    events: new DrizzleEventRepository(db),
    submissions: new DrizzleSubmissionRepository(db),
    runs: new DrizzleRunRepository(db),
    users: new DrizzleUserRepository(db),
    sessions: new DrizzleSessionRepository(db),
    profiles: new DrizzleUserProfileRepository(db),
    curricula: new DrizzleCurriculumRepository(db),
    skillStates: new DrizzleUserSkillStateRepository(db),
    curriculumProgress: new DrizzleUserCurriculumProgressRepository(db),
    recommendations: new DrizzleRecommendationRepository(db),
  };
}
