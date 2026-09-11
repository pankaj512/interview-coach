# Session Handoff

## S0 — Bootstrap + frozen docs (2026-09-11)
Status: done (pending verification below).

Done:
* Root `pnpm-workspace.yaml` (`packages/*`), `package.json` (pnpm@12.3.4, node>=20, scripts: dev/build/typecheck/test/lint), `tsconfig.base.json` (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes), `tsconfig.json` (noEmit, empty include).
* `docker-compose.yml` (postgres:16, env-driven), `.env.example` (server-only Azure vars, tool defaults 8s/2 retries/30min, `VITE_BACKEND_URL` only).
* `docs/architecture-frozen.md` (planes, realtime config, tool reliability defaults, lifecycle, stack).
* `packages/.gitkeep` placeholder. No `packages/cli` — external harness at `/home/pankaj/dev/Projects/InterviewCoachCli`.

Decisions locked:
* pnpm + Fastify + Postgres/Drizzle + direct Browser→Voice Live (ephemeral) + in-memory idempotency MVP.

Open for S1:
* Scaffold `packages/domain` (entities + state machine + Result + branded IDs + vitest).
* Add per-package `package.json`/`tsconfig.json` referencing base; extend root `tsconfig.json` include.

Verify: `pnpm install && pnpm typecheck` (S0 exit).
Verified 2026-09-11: `pnpm install` ok (esbuild allowBuilds in pnpm-workspace.yaml), `pnpm typecheck` ok, `pnpm test` 1 passed (s0-smoke), `pnpm build` (`tsc -b`) ok. Toolchain: node v24.21.0, pnpm 12.3.4, typescript 5.9.3, vitest 3.2.7.
Tag: `session-0` after commit.

## S1 — Domain model + backend foundation (2026-09-11)
Status: done (pending verification below).

Done:
* `packages/domain` (`@interview-coach/domain`): pure domain layer, no I/O/HTTP/DB.
  * Primitives: `result.ts` (Result ok/err/map/andThen), `errors.ts` (VALIDATION_ERROR/NOT_FOUND/ILLEGAL_TRANSITION/NO_CURRENT_PROBLEM/CONFLICT), `ids.ts` (branded User/Interview/Problem/Response/Evaluation/Event IDs, `node:crypto` UUIDs + stable `as*` casts).
  * Entities (HLD 1.1): `user.ts`, `problem.ts` (HLD 5.4 shape; catalog-compatible), `interview.ts` (Interview + InterviewConfiguration + InterviewProblem + currentOrder), `candidate-response.ts`, `evaluation.ts` (HLD 5.8 dimensions, 0..5 scores), `interview-event.ts` (append-only lifecycle log).
  * `lifecycle.ts`: frozen transition table (`created → ready → in_progress ⇄ paused → completing → completed` + `cancelled`/`failed`), pure `transition()` stamping startedAt/endedAt.
  * `repositories.ts`: async repo interfaces + in-memory impls (contract for S2 Drizzle swap).
  * `interview-service.ts`: create/ready/start/pause/resume/beginCompleting/complete/cancel/fail + assignProblems/setCurrentProblem/recordResponse/recordEvaluation/getState, clock-injected.
  * `tool-service.ts`: narrow tools `get_current_problem`/`get_interview_state`/`get_candidate_performance`/`end_interview` (model signals done → `completing`, idempotent; `dispatch` logs tool.invoked/tool.failed). `call_id` dedup stays in S3 voice-service.
  * `catalog.ts`: pure `dsa-problem-catalog.json` → Problem import, slug-stable IDs (`prob_<slug>`), per-item errors + duplicate detection.
  * `tests/`: lifecycle (6), interview-service (6), tool-service (7), catalog (4).
* `packages/domain/package.json` (+ `@types/node`, vitest, typescript devDeps), `packages/domain/tsconfig.json` (extends base, noEmit). Root runners unchanged; root `tsconfig.json` include already covers `packages/**/*.ts`.

Decisions locked:
* Repos/services async from day one so S2 Postgres swaps impls without signature churn.
* Tool results are JSON-serializable (ISO timestamps) for future Voice Live `function_call_output`.

Open for S2:
* Drizzle schema + migrations + Postgres-backed repos behind S1 interfaces; process-restart persistence (HLD Phase 2 exit).

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build` (S1 exit).
Verified 2026-09-11: install ok, typecheck ok, test 24 passed (1 s0-smoke + 23 domain), build (`tsc -b`) ok.
Tag: `session-1` after commit.

## S2 — Persistence (2026-09-11)
Status: done (pending verification below).

Done:
* `packages/db` (`@interview-coach/db`): Postgres persistence behind S1 interfaces, same async signatures (InterviewService/ToolService run unchanged).
  * `src/schema.ts`: 7 tables (HLD 5.11) — `users`, `problems`, `interviews` (+ JSON `configuration`), `interview_problems` (ordered assignments, PK `(interview_id, order)`), `candidate_responses`, `evaluations`, `interview_events`. Indexes on all `interview_id`/candidate lookups. No FK `interviews.candidate_id → users` (S1 service accepts arbitrary candidate IDs; auth lands S7).
  * `src/repositories.ts`: `Drizzle*` impls of all 5 S1 repo interfaces + `DrizzleUserRepository` (future auth) + `createDrizzleRepositories()`. `InterviewRepository.save` writes interview row + assignments atomically (`db.transaction`); all saves are upserts (replay/seed-safe).
  * `src/client.ts` (`createDatabase`, `close()` for restart simulation), `src/migrate.ts` (drizzle migrator), `src/seed.ts` (catalog → problems, stable `prob_<slug>` IDs, idempotent).
  * `drizzle/0000_fancy_captain_universe.sql`: initial migration (7 tables).
  * `tests/persistence.test.ts` (3): problem round-trip + `findManyByIds` order, full lifecycle on Postgres repos, close-and-reconnect restart survival (state, responses, evaluation, events all intact; lifecycle advances after restart).
* Driver: `postgres` (postgres-js) + `drizzle-orm`; `drizzle-kit` + `tsx` dev-only.

Decisions locked:
* `findByInterview` returns latest evaluation (S1 in-memory returns first found; single eval per interview in practice).
* Integration tests warn-and-pass without a DB so `pnpm test` stays green; they run for real with Postgres up.
* Local env note: host port 5432 is occupied by a system Postgres 18, so `docker compose up db` runs on 5433 here: `POSTGRES_PORT=5433 docker compose up db`, with `DATABASE_URL=postgresql://coach:coach_dev_only@localhost:5433/interview_coach` for migrate/seed/test. Compose defaults (5432) unchanged.

Open for S3:
* Fastify backend + voice session service + `call_id` idempotency (`POST /api/interviews/:id/tool-exec`, in-memory Map per frozen §5).

Verify: `POSTGRES_PORT=5433 docker compose up -d db && DATABASE_URL=... pnpm --filter @interview-coach/db db:migrate && pnpm install && pnpm typecheck && DATABASE_URL=... pnpm test && pnpm build` (S2 exit).
Verified 2026-09-11: migrate ok, install ok, typecheck ok, test 27 passed (24 prior + 3 persistence, live vs postgres:16), seed 300 problems / 0 skipped (idempotent ×2), build (`tsc -b`) ok. No-DB run: 27 passed with skip warnings.
Tag: `session-2` after commit.

