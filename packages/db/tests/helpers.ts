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
  await db.delete(schema.candidateResponses);
  await db.delete(schema.evaluations);
  await db.delete(schema.interviewProblems);
  await db.delete(schema.interviews);
  await db.delete(schema.problems);
  await db.delete(schema.users);
}

export async function connectTestDb(): Promise<TestContext | null> {
  const handle = createDatabase();
  try {
    await handle.db.execute(sql`select 1`);
  } catch {
    await handle.close();
    return null;
  }
  return { handle, db: handle.db, repos: createDrizzleRepositories(handle.db) };
}

// Wrap a test body: skips with a warning when Postgres is unavailable.
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
    await truncateAll(t.db);
    await body(t);
  };
}
