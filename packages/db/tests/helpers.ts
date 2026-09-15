// Integration-test helpers (S2). Tests need a live Postgres
// (`docker compose up db` + `db:migrate`). If the DB is unreachable the
// tests warn-and-pass so `pnpm test` stays green without infrastructure;
// CI runs them for real with the DB up.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "../src/client.js";
import * as schema from "../src/schema.js";
import { createDrizzleRepositories } from "../src/repositories.js";
import type { RepositorySet } from "@interview-coach/domain";

export interface TestContext {
  readonly handle: Database;
  readonly db: PostgresJsDatabase<typeof schema>;
  readonly repos: RepositorySet;
}

export async function truncateAll(db: PostgresJsDatabase<typeof schema>): Promise<void> {
  // FK order: children first.
  await db.delete(schema.interviewEvents);
  await db.delete(schema.interviewMessages);
  await db.delete(schema.evaluationJobs);
  await db.delete(schema.candidateResponses);
  await db.delete(schema.evaluations);
  await db.delete(schema.interviewProblems);
  await db.delete(schema.interviews);
  await db.delete(schema.curriculumTopicProblems);
  await db.delete(schema.curriculumTopics);
  await db.delete(schema.curriculumModules);
  await db.delete(schema.curricula);
  await db.delete(schema.problems);
  await db.delete(schema.userSkillStates);
  await db.delete(schema.userCurriculumProgress);
  await db.delete(schema.userProfiles);
  await db.delete(schema.recommendations);
  await db.delete(schema.userSessions);
  await db.delete(schema.users);
}

// Never let these destructive tests wipe a non-test database. A dev DB
// seeded with the problem catalog is a tempting `DATABASE_URL`, and
// `truncateAll` deletes `problems` — which silently empties auto-select. Run
// against a dedicated `*_test` database (TEST_DATABASE_URL), or opt in
// explicitly for a throwaway DB with ALLOW_DESTRUCTIVE_DB_TESTS=true (CI).
export function destructiveTestsAllowed(): boolean {
  if (process.env["ALLOW_DESTRUCTIVE_DB_TESTS"] === "true") return true;
  const url =
    process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  try {
    const name = new URL(url).pathname.replace(/^\//, "");
    return /test/i.test(name);
  } catch {
    return false;
  }
}

export async function connectTestDb(): Promise<TestContext | null> {
  // Prefer a dedicated test database so the dev catalog is never touched.
  const handle = createDatabase(process.env["TEST_DATABASE_URL"]);
  try {
    await handle.db.execute(sql`select 1`);
  } catch {
    await handle.close();
    return null;
  }
  return { handle, db: handle.db, repos: createDrizzleRepositories(handle.db) };
}

// Wrap a test body: skips with a warning when Postgres is unavailable, or
// when the target database is not clearly a test database.
export function withDb(
  ctx: { current: TestContext | null },
  body: (t: TestContext) => Promise<void>,
): () => Promise<void> {
  return async () => {
    const t = ctx.current;
    if (t === null) {
      console.warn("Postgres unavailable — skipping persistence test");
      return;
    }
    if (!destructiveTestsAllowed()) {
      console.warn(
        "Refusing to truncate a non-test database — set TEST_DATABASE_URL to a *_test database, or ALLOW_DESTRUCTIVE_DB_TESTS=true. Skipping persistence test",
      );
      return;
    }
    await truncateAll(t.db);
    await body(t);
  };
}
