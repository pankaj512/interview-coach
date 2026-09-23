# 18b. Full problem reseed — completed

**Build attempt:** 1
**Branch:** `feature/full-problem-reseed` (deleted after merge)
**Checkpoint:** `85e673ed69df77efd16b37ba9f2050194307e54b` (tree `ff98ad6b`, spec `dabbc316`)
**Merged to main:** local only (push declined)

## What was built

Postgres owns statements, constraints, examples, verbatim starters, and runner
links for all 300 catalog problems:

- Two nullable `jsonb` columns on `problems` (`starters`, `runner_links`) via
  `drizzle/0010_regular_banshee.sql` (additive, metadata-only, no backfill).
- Domain `ProblemStarters`, `ProblemActualRule`, `ProblemRunnerLink(s)`;
  `Problem` / `CreateProblemInput` / `createProblem` extended optional.
- `toProblemRow` / `toProblem` map both columns null-safe both ways.
- `db:seed` merges `problem-content-enrichment.json` by `prob_<slug>` id
  (verbatim values, actualRule-validated, method-sequence `entry: ""` stored
  as-is), prints `seeded…` + `enriched N … M title-only gaps` + per-gap lines,
  degrades to title-only when the dataset file is absent.
- Persistence round-trip test (enriched + title-only gap problems).

## Verification evidence

- Live-DB gate on dedicated `interview_coach_test`: migrate + seed → 300
  problems, 300 enriched with starters, 0 title-only gaps; SQL: 300 rows, 236
  with a link, 64 link-absent; move-zeroes py/js/cpp = shape-048/053/069.
- Round-trip test 12/12 on the live test DB (`TEST_DATABASE_URL`).
- `pnpm typecheck` clean; full `pnpm test` 66 files / 1116 tests green.
- Independent review (automatic, fresh subagent): **passed**, no P0/P1.
  Findings recorded in the ledger: F-05 [P2] open (destructive title-only
  reseed on missing dataset), F-06 [P3] open (silent malformed links),
  F-07 [P3] open (round-trip covers only the python link).

## Active spec at completion

Spec `dabbc316` (5383 bytes), Status: verified, 5/5 steps checked. Full text:

# Feature: Full problem reseed

**From build-plan:** feature 18b
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/full-problem-reseed`

## Goal

Reseed all 300 catalog problems from the cleaned 18a dataset so Postgres —
the system of record — owns statements, constraints, examples, verbatim
starters, and runner links. One `db:seed` pass, idempotent, with zero impact
on user state, interviews, or the curriculum tree.

## In scope

- Two new nullable `jsonb` columns on `problems`: `starters` and
  `runner_links`, via a Drizzle migration (`db:generate`).
- Domain `Problem` / `CreateProblemInput` / `createProblem` extended with
  `starters` (`{cpp, javascript, python}` verbatim text) and `runnerLinks`
  (`{python?, javascript?, cpp?}`, each `{runnerId, entry, className,
  actualRule}`); absent link = field absent, never invented.
- `DrizzleProblemRepository` row mapping (`toProblemRow` / `toProblem`)
  extended for the new columns.
- `db:seed` merges `problem-content-enrichment.json` into the catalog import
  by `prob_<slug>` id and prints a gap report (title-only rows kept, gaps
  listed, never fabricated).
- Live-DB gate proving 300 rows reseed with enrichment intact.

## Out of scope

- New endpoints or client wiring (18c); old-endpoint retirement (deferred).
- AI-only Submit (18d); hidden tests; singleton inline runners (open).

## Data / contracts

- `starters`: `{cpp, javascript, python}` verbatim cache text, nullable
  column, present for all 300.
- `runner_links`: `{python?: Link, javascript?: Link, cpp?: Link}`,
  `Link = {runnerId, entry, className, actualRule:
  "pure" | "in-place" | "method-sequence"}`; link-absent problems store no
  key (gap), matching the frozen dataset.
- Reseed is upsert-on-id; user progress, interviews, and the curriculum tree
  are untouched (no new FKs).

## Open questions (carried, unresolved)

- Full-300 vs gap-list for 18b (from 18a): reseeds all 300 with enrichment
  where present, title-only + gap report otherwise.
- Singleton inline runners: still undecided; out of scope here either way.
