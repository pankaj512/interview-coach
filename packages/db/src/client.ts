// Postgres connection factory. One `postgres` client per Database handle;
// call `close()` to simulate a process restart in tests (HLD Phase 2 exit:
// authoritative state must survive restarts).

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export interface Database {
  readonly db: PostgresJsDatabase<typeof schema>;
  close(): Promise<void>;
}

export function createDatabase(url?: string): Database {
  const connectionString =
    url ??
    process.env["DATABASE_URL"] ??
    "postgresql://coach:coach_dev_only@localhost:5432/interview_coach";
  const sql = postgres(connectionString, { max: 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    close: () => sql.end(),
  };
}
