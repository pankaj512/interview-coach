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

export const problems = pgTable("problems", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  difficulty: text("difficulty").notNull(),
  description: text("description"),
  constraints: jsonb("constraints").$type<readonly string[]>(),
  examples: jsonb("examples").$type<
    readonly { input: string; output: string; explanation?: string }[]
  >(),
  expectedConcepts: jsonb("expected_concepts").$type<readonly string[]>(),
  sourceLinks: jsonb("source_links").$type<{ DSA?: string; leetcode?: string }>(),
  evaluationCriteria: jsonb("evaluation_criteria").$type<readonly string[]>(),
});

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("interviews_candidate_id_idx").on(t.candidateId)],
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

export const evaluations = pgTable(
  "evaluations",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
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
