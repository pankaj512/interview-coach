# Audit — Phase 2: Persistence

- **HLD phase:** Phase 2 (Persistence)
- **Implemented in:** S2 (`@interview-coach/db`), tag `session-2`
- **Source of truth:** HLD §2.1–2.4, §5.11; frozen §7 (Drizzle/Postgres 16)
- **Scope of this audit:** `packages/db` S2 core — schema, migrations, Drizzle
  repositories behind the S1 `RepositorySet` interfaces, seed, client/migrate,
  and the restart-survival exit criterion. Later tables (S7a submissions/runs,
  S8c users/sessions) are audited in Phases 6/7; they are noted here only where
  they interact with S2 code. Auth, voice-session, HTTP exposure, sandbox, and
  retention are out of scope (Phases 3/6/7/8).

## Exit criteria (HLD, quoted)

> **Exit criteria:** Process restart does not destroy authoritative interview
> state. (§2.4)

## Checklist vs HLD

### 2.1 Database integration
- [x] Schema: 7 tables (HLD 5.11) — `users`, `problems`, `interviews`
      (+ JSON `configuration`), `interview_problems`, `candidate_responses`,
      `evaluations`, `interview_events` (`schema.ts`).
- [x] Migrations: `drizzle/0000` (7 tables) → `0001` (S7a sandbox) →
      `0002` (S8c accounts); `drizzle.config.ts` + `meta/_journal.json` present.
- [x] Repositories: `Drizzle*` classes implement every S1 repo interface;
      `createDrizzleRepositories()` returns the domain `RepositorySet`
      (`repositories.ts:665`). No signature churn — `InterviewService`/
      `ToolService` run unchanged (handoff item 1 verified).
- [x] Indexes: `interview_id` on all child tables, `candidate_id` on
      interviews, `users.email`, `user_sessions.user_id`,
      `code_runs.submission_id/interview_id`, plus the
      `interview_problems(interview_id, problem_id)` unique index.
- [x] Transaction boundaries: `InterviewRepository.save` writes the interview
      row + its problem assignments atomically (`db.transaction`,
      `repositories.ts:76`).
- [ ] Enum values are unconstrained at the DB layer (free `text`, no CHECK) —
      see P2-5.

### 2.2 Interview persistence
- [x] Creation (`createInterview` → `save`), start / completion / cancellation
      / failure all persist via `move()` → `save` (lifecycle + `interview_events`).
- [x] `findById` reassembles the ordered problem list from `interview_problems`.
- [ ] No optimistic-concurrency guard on save (F9 partially closed) — see P2-1.

### 2.3 Candidate interaction
- [x] `candidate_responses` persisted independently (`append`), with
      `problem_id` nullable (kind/approach notes need no problem).
- [x] `listByInterview` orders oldest-first (`asc created_at`).
- [ ] In-memory vs Drizzle ordering divergence (F7 sibling) — see P2-3.

### 2.4 Evaluation persistence
- [x] Structured evaluation persisted in its own table, independent from raw
      conversation (HLD 5.11).
- [x] `findByInterview` returns the **latest** evaluation (`desc created_at`
      limit 1) — closes Phase-1 F7 at the Drizzle layer.
- [ ] In-memory impl still returns first-inserted (F7 residual, domain side —
      carried forward).

### Cross-cutting (HLD §5.11 / frozen §7)
- [x] `findManyByIds` preserves input order and skips missing ids
      (`repositories.ts:239-252`, test `persistence.test.ts:35-46`) — handoff
      item 2 verified.
- [x] Restart survival is directly tested (`close()` → reconnect →
      re-read state/eval/events/submissions/runs, lifecycle still advances).

## Verification (run this session)

```
pnpm install        # already installed
pnpm typecheck      # ok (tsc --noEmit)
pnpm test           # 258 passed (36 files) — persistence warn-and-pass w/o DB
pnpm build          # ok (tsc -b)
# live-DB (postgres:16, port 5433):
POSTGRES_PORT=5433 docker compose up -d db
DATABASE_URL=postgresql://coach:coach_dev_only@localhost:5433/interview_coach \
  pnpm --filter @interview-coach/db db:migrate    # migrations applied (idempotent)
DATABASE_URL=... pnpm test                        # 258 passed, persistence live (5/5)
```

Result: all green. Live persistence tests (5) pass for real against Postgres 16,
including the restart-survival and cascade-delete tests. Stack torn down after.

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| P2-1 | Minor | `repositories.ts:75-148` (`db.transaction` + plain `onConflictDoUpdate`); `interview-service.ts:367-380` | 2.2, frozen §6 | F9 only half-closed: the *transactional* save (interview row + assignments atomic) is done, but the *compare-and-swap* half is missing — no `updatedAt`/version precondition, so concurrent read-modify-write in `move()`/`assignProblems` is still last-write-wins. | Add CAS on `updatedAt` (or a version column) to `save`, or accept + document the single-writer assumption explicitly. |
| P2-2 | Minor | `schema.ts:97-100` (unique `(interview_id, problem_id)`); `repositories.ts:137-146`; `interview-service.ts:165-193` | 1.3, 2.2 | `assignProblems` accepts duplicate problem ids; the unique index then rejects the insert with an uncaught constraint error (HTTP 500) instead of a clean domain error. In-memory has no such constraint, so unit tests diverge from prod. | Reject (or dedup) duplicate ids in `assignProblems` — sibling of Phase-1 F3. |
| P2-3 | Minor | `repositories.ts:318-336, 406-424` (order by `created_at`/`occurred_at`); domain `repositories.ts:110-151` (insertion order) | 2.3/2.4, F7 | Ordering divergence extends beyond F7 to responses and events: Drizzle sorts by timestamp, in-memory returns insertion order. Usually oldest-first, but identical/injected timestamps diverge. | Document the invariant and make both order deterministically (sort in-memory too, or order both by timestamp). |
| P2-4 | Nit | `repositories.ts:254-257` (bare `select()`, no order) | 2.1 | `ProblemRepository.list()` returns unspecified order. No current impact (`/api/problems` re-sorts at `app.ts:750`; `/api/problems/select` re-sorts in `selection.ts`; `/api/ready` only checks reachability). | Add a stable `order by` (e.g. title) for deterministic reads. |
| P2-5 | Minor | `schema.ts:66,68,93,113,177,196,145` (enums as `text`); `repositories.ts:52-70` (unchecked `as` casts) | 2.1, 5.11 | Domain enum sets (`status`, `type`, `state`, `difficulty`, `kind`, `language`, run `status`, `recommendation`) are unconstrained at the DB; reads cast blindly, so a stray write surfaces silently-invalid values. Backend owns truth at the app layer but the store doesn't reinforce it. | Add CHECK constraints (or validate on read). |
| P2-6 | Nit | `repositories.ts:150-203` (two queries, no transaction) | 2.2 | `findById` reads the interview row and its assignments in separate statements/snapshots; a concurrent `save`'s delete+insert could yield a torn read (row `currentOrder` from one snapshot, assignments from another). Low risk (single writer). | Read both in one transaction, or accept + document. |
| P2-7 | Nit | `interview-service.ts:66-76, 367-380` | 2.2 | Event-log writes sit outside the interview-save transaction; an event-append failure leaves state advanced without its log entry. Events are non-authoritative (append-only), so no state loss. | Accept (document) or fold event append into the save transaction. |
| P2-8 | Nit | `repositories.ts:130-131` | 2.2 | Interview `save` conflict-update sets `started_at`/`ended_at` to `?? null`; safe today because services always read-modify-write the full entity, but a future partial-save caller would null timestamps. | Preserve existing timestamps on conflict when undefined. |

## Carried forward from Phase 1

- **F1 (Major)** — divergent `InterviewDifficulty` (`Easy|Medium|Mixed`) vs
  `ProblemDifficulty` (`Easy|Medium|Hard`). Persistence mirrors it faithfully
  (`schema.ts` `configuration.difficulty` cast is `Easy|Medium|Mixed`);
  S2 neither fixes nor worsens it. Still open — expected to resurface in
  Phase 5 (selection path) and UI §5.
- **F2 (Minor)** — multi-problem progression (`completed`/`skipped` states)
  still unimplemented; `interview_problems.state` stores only
  `active`/`assigned`. Still open for Phase 4/5.
- **F7 (Minor)** — latest-evaluation ordering: *closed at the Drizzle layer*
  (`desc created_at`). Residual: in-memory `findByInterview` still returns
  first-inserted; belongs to `packages/domain`, not S2.
- **F9 (Minor)** — see P2-1 (transactional half done, CAS half open).

## Handoff to Phase 3 (Voice session service)

- Verify S3 idempotency (`call_id` dedup) never re-persists state that S2
  already wrote; confirm the tool-exec path is read-only over the S2 repos
  except for domain-service writes (responses/hints) — no raw DB access.
- P2-2 (duplicate `assignProblems` ids) can surface as an uncaught 500 via the
  S3 `POST /api/interviews/:id/problems` route — verify the route validation
  rejects duplicates, or fix `assignProblems` first.
- F1/F2 and P2-3/P2-4/P2-5 remain open; P2-1 (CAS) stays a known single-writer
  assumption until multi-instance deployment is real (S8).
