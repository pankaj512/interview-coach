// @interview-coach/db — Postgres schema (HLD Phase 2 / S2).
// Mirrors the S1 domain entities 1:1. Interviews embed their ordered
// problem list in the domain; here it lives in `interview_problems` and is
// reassembled on read. No FK from interviews.candidate_id to users: the S1
// service accepts arbitrary candidate IDs (auth lands in S7), so a hard FK
// would break service-level tests. Users table exists for future auth.

import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    // S8c accounts (HLD 7.1): nullable at the DB level because pre-S8c rows
    // predate credentials; auth flows require both (enforced above this layer).
    email: text("email").unique(),
    passwordHash: text("password_hash"),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("user_sessions_user_id_idx").on(t.userId)],
);

// Learning-loop Phase 2: one profile per user (starting context for
// recommendation/evaluation). Keyed by user id; cascade with the account.
// Role/level/interview-type validity is enforced by CHECK constraints added in
// migration 0004 (the domain validates first; the DB is the last guard).
export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    interviewTypes: jsonb("interview_types").notNull().$type<readonly string[]>(),
    role: text("role").notNull(),
    level: text("level").notNull(),
    goals: text("goals"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("user_profiles_role_idx").on(t.role)],
);

export const problems = pgTable(
  "problems",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    difficulty: text("difficulty").notNull(),
    // Learning-loop Phase 3: canonical curriculum topic. Plain text (no FK):
    // the catalog seeds before the curriculum and topic IDs are validated by
    // the domain importer; the FK would also force a seed ordering that the
    // standalone `db:seed` (problems-only) cannot guarantee.
    topicId: text("topic_id"),
    description: text("description"),
    constraints: jsonb("constraints").$type<readonly string[]>(),
    examples: jsonb("examples").$type<
      readonly { input: string; output: string; explanation?: string }[]
    >(),
    expectedConcepts: jsonb("expected_concepts").$type<readonly string[]>(),
    sourceLinks: jsonb("source_links").$type<{ DSA?: string; leetcode?: string }>(),
    evaluationCriteria: jsonb("evaluation_criteria").$type<readonly string[]>(),
  },
  (t) => [index("problems_topic_id_idx").on(t.topicId)],
);

// Learning-loop Phase 3: server-owned curriculum (static seeded config).
// curricula -> modules -> topics -> topic-problems, all cascade on delete so
// a curriculum re-seed replaces the tree cleanly. The topic-problem join
// preserves the curriculum's within-topic pedagogical order.
export const curricula = pgTable("curricula", {
  id: text("id").primaryKey(),
  interviewType: text("interview_type").notNull(),
  name: text("name").notNull(),
  version: integer("version").notNull(),
});

export const curriculumModules = pgTable(
  "curriculum_modules",
  {
    id: text("id").primaryKey(),
    curriculumId: text("curriculum_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
  },
  (t) => [index("curriculum_modules_curriculum_id_idx").on(t.curriculumId)],
);

export const curriculumTopics = pgTable(
  "curriculum_topics",
  {
    id: text("id").primaryKey(),
    curriculumId: text("curriculum_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
    moduleId: text("module_id")
      .notNull()
      .references(() => curriculumModules.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    name: text("name").notNull(),
  },
  (t) => [
    index("curriculum_topics_curriculum_id_idx").on(t.curriculumId),
    index("curriculum_topics_module_id_idx").on(t.moduleId),
  ],
);

export const curriculumTopicProblems = pgTable(
  "curriculum_topic_problems",
  {
    topicId: text("topic_id")
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: "cascade" }),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.topicId, t.problemId] }),
    index("curriculum_topic_problems_topic_id_idx").on(t.topicId),
  ],
);

// Learning-loop Phase 3: per-user, per-topic mastery. Unique key
// (user_id, curriculum_id, topic_id); curriculum_id equals the interview type
// for v1 ("dsa"). topic_id is plain text by design: a re-seed replaces
// curriculum_topics rows, and a hard FK would cascade-delete user progress.
// Validity is enforced by the domain/service layer; users cascade.
export const userSkillStates = pgTable(
  "user_skill_states",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    curriculumId: text("curriculum_id").notNull(),
    topicId: text("topic_id").notNull(),
    masteryLevel: text("mastery_level").notNull(),
    successfulAttempts: integer("successful_attempts").notNull(),
    totalAttempts: integer("total_attempts").notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastOutcome: text("last_outcome"),
    strengths: jsonb("strengths").notNull().$type<readonly string[]>(),
    weaknesses: jsonb("weaknesses").notNull().$type<readonly string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.curriculumId, t.topicId] }),
    index("user_skill_states_user_id_idx").on(t.userId),
  ],
);

export const userCurriculumProgress = pgTable(
  "user_curriculum_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    curriculumId: text("curriculum_id").notNull(),
    currentTopicId: text("current_topic_id"),
    completedTopicIds: jsonb("completed_topic_ids")
      .notNull()
      .$type<readonly string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.curriculumId] })],
);

// Learning-loop Phase 4: persisted recommendations (LLM-proposed, backend-
// validated, or deterministic fallback). Cascades with the account. topic_id /
// problem_id are plain text by design (same reasoning as user_skill_states): a
// curriculum re-seed replaces topic rows and must never delete user state;
// validity is the domain/service boundary. CHECK constraints live in the
// migration.
export const recommendations = pgTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    curriculumId: text("curriculum_id").notNull(),
    recommendationType: text("recommendation_type").notNull(),
    topicId: text("topic_id").notNull(),
    problemId: text("problem_id").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("recommendations_user_id_idx").on(t.userId),
    index("recommendations_user_status_idx").on(t.userId, t.status),
  ],
);

export const interviews = pgTable(
  "interviews",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    configuration: jsonb("configuration").notNull().$type<{
      interviewType: string;
      difficulty?: string;
      durationMinutes?: number;
      problemCount?: number;
      topicFocus?: readonly string[];
    }>(),
    currentOrder: integer("current_order"),
    // Learning-loop Phase 9: the recommendation this session was started from
    // and the targeted curriculum topic. Plain text (no FK) for the same reason
    // as recommendations: a curriculum re-seed must not delete interviews.
    recommendationId: text("recommendation_id"),
    topicId: text("topic_id"),
    // Learning-loop Phase 10 lifecycle; Phase 9 persists "none".
    evaluationStatus: text("evaluation_status").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("interviews_candidate_id_idx").on(t.candidateId),
    index("interviews_recommendation_id_idx").on(t.recommendationId),
  ],
);

export const interviewProblems = pgTable(
  "interview_problems",
  {
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id),
    order: integer("order").notNull(),
    state: text("state").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.interviewId, t.order] }),
    uniqueIndex("interview_problems_interview_problem_uniq").on(
      t.interviewId,
      t.problemId,
    ),
    index("interview_problems_interview_id_idx").on(t.interviewId),
  ],
);

export const candidateResponses = pgTable(
  "candidate_responses",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    problemId: text("problem_id").references(() => problems.id),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("candidate_responses_interview_id_idx").on(t.interviewId)],
);

// Learning-loop Phase 9: structured transcript (no raw audio). Cascades with
// the interview; reads are chronological. role validity is enforced by the
// domain boundary and a CHECK added in the migration.
export const interviewMessages = pgTable(
  "interview_messages",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    problemId: text("problem_id").references(() => problems.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("interview_messages_interview_id_idx").on(t.interviewId)],
);

export const evaluations = pgTable(
  "evaluations",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    // Learning-loop Phase 10: provenance + job linkage. Plain text (no FK) so
    // an evaluation outlives a deleted job row / curriculum re-seed.
    topicId: text("topic_id"),
    status: text("status").notNull().default("completed"),
    source: text("source"),
    jobId: text("job_id"),
    dimensions: jsonb("dimensions").notNull().$type<
      Partial<
        Record<
          | "understanding"
          | "approach"
          | "correctness"
          | "complexity"
          | "edge_cases"
          | "communication"
          | "code_quality"
          | "independence",
          { score: number; notes?: string }
        >
      >
    >(),
    hintsUsed: integer("hints_used").notNull(),
    strengths: jsonb("strengths").notNull().$type<readonly string[]>(),
    weaknesses: jsonb("weaknesses").notNull().$type<readonly string[]>(),
    recommendation: text("recommendation"),
    overallScore: integer("overall_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("evaluations_interview_id_idx").on(t.interviewId)],
);

// Learning-loop Phase 10: durable async evaluation jobs. Cascades with the
// interview; the runner claims pending rows. status validity is enforced by
// the domain and a CHECK in the migration.
export const evaluationJobs = pgTable(
  "evaluation_jobs",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("evaluation_jobs_interview_id_idx").on(t.interviewId),
    index("evaluation_jobs_status_idx").on(t.status),
  ],
);

export const interviewEvents = pgTable(
  "interview_events",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("interview_events_interview_id_idx").on(t.interviewId)],
);

// S7a sandbox tables (HLD 6.1/6.3). Submissions + runs are backend-owned
// artefacts: cascade with the interview, indexed for per-interview reads.
// Run results (per-case verdicts) ride as JSONB; hidden cases are already
// masked at assembly time, so stored rows never leak hidden actuals.
export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    problemId: text("problem_id").references(() => problems.id),
    language: text("language").notNull(),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("submissions_interview_id_idx").on(t.interviewId)],
);

export const codeRuns = pgTable(
  "code_runs",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    results: jsonb("results").notNull().$type<
      readonly {
        name: string;
        hidden: boolean;
        passed: boolean;
        actual?: unknown;
        error?: string;
      }[]
    >(),
    passedCount: integer("passed_count").notNull(),
    totalCount: integer("total_count").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("code_runs_interview_id_idx").on(t.interviewId),
    index("code_runs_submission_id_idx").on(t.submissionId),
  ],
);
