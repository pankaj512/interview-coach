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

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

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
