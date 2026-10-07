// Applies pending Drizzle migrations to Postgres (drizzle/ folder).
// Usage: `pnpm --filter @interview-coach/store db:migrate`
// (or `DATABASE_URL=... pnpm db:migrate` from packages/store).

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString =
  process.env["DATABASE_URL"] ??
  "postgresql://coach:coach_dev_only@localhost:5432/interview_coach";

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");
await sql.end();
