# Fix: Open seed audit findings (F-05, F-06, F-07)

**Type:** Fix
**Status:** verified
**Branch:** fix/open-seed-audit-findings
**Fixes:** F-05, F-06, F-07

## The problem

Three open findings from the 18b independent review, all in the seed area:

- **F-05 [P2]** — `packages/db/src/seed.ts:123-135`: a missing/unparseable `problem-content-enrichment.json` (or zero records) falls through to upserting all 300 catalog rows title-only, and `save` is `onConflictDoUpdate`, so it actively wipes existing enrichment. Recoverable by re-seed, but aborting is safer.
- **F-06 [P3]** — `packages/db/src/seed.ts:62-79`: `toRunnerLink` returns `undefined` silently on malformed links, so a dataset regression is indistinguishable from a legitimate gap in the report.
- **F-07 [P3]** — `packages/db/tests/persistence.test.ts:72-94`: the round-trip test covers only the python link; the method-sequence `entry: ""` verbatim path and the javascript/cpp keys are unproven, and there is no domain-level `createProblem` passthrough test.

## The fix

Root-cause repairs, no new machinery:

1. **Abort on empty dataset** (F-05): when the dataset file is missing/unparseable or yields zero records, log to stderr and exit non-zero *before any upsert*. Per-problem gaps (record present but unusable) still seed title-only as today.
2. **Warn on malformed links** (F-06): thread problem id + language key into `toRunnerLink` and `console.warn` each malformed link (record present, link invalid) with id and reason, per the existing `seed skip` stdout precedent. Absent links stay silent (legitimate gaps).
3. **Extend round-trip coverage** (F-07): extend the persistence test with a method-sequence-link problem (`entry: ""`) plus javascript and cpp keys, and add a domain unit test for the `createProblem` starters/runnerLinks passthrough.

Must not break: the normal enriched seed path (300 rows, enrichment counts), legitimate gap reporting, idempotent re-seed.

## Build steps

- [x] Step 1: Abort on empty dataset + warn on malformed links.
  - Done when: seed with a missing dataset file exits non-zero with zero upserts; seed with a malformed link warns with problem id + reason and still seeds.
- [x] Step 2: Extended round-trip + domain passthrough tests.
  - Done when: persistence test covers method-sequence `entry: ""` and all three language keys; domain `createProblem` passthrough test exists and passes.

## Verify

- `pnpm typecheck` clean; db package tests green against a scratch `*_test` DB (`TEST_DATABASE_URL` + `ALLOW_DESTRUCTIVE_DB_TESTS`; they warn-and-pass without one, so the live-DB run is the real proof); full `pnpm test` green.
- Manual: back up dev DB enrichment first if touching it — prefer the scratch DB; never run `db:seed` against `interview_coach` dev data for this proof.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2801,"specSha256":"476c201f8f345611b452a0ec43e4a295a8b7b32c7811c167b2aac3f2ae9b4de2","branch":"refs/heads/fix/open-seed-audit-findings","head":"1d97f469d67b63ceb3ecab5a4103169424e3954f","baseRef":"refs/heads/main","baseCommit":"1d97f469d67b63ceb3ecab5a4103169424e3954f","sourceTree":"953d307b1b0f9049fa7edb240f79fde3aa09aefa","absentOptional":[]} -->

## Completion

- Branch: fix/open-seed-audit-findings (head == base == main@1d97f46 at archival). Fixes F-05, F-06, F-07.
- Changes: packages/db/src/seed.ts — empty-dataset abort (missing/unparseable/zero records throws seed abort; call site logs to stderr + process.exit(1) before any upsert); toRunnerLink(raw, problemId, language) warns seed skip link [<id>] <lang> on malformed links, absent links stay silent. packages/db/tests/persistence.test.ts — round-trip test gains a method-sequence (entry "") problem with python + javascript + cpp links. packages/domain/tests/problem.test.ts (new) — createProblem starters/runnerLinks verbatim passthrough.
- Gates: pnpm typecheck clean; live-scratch-DB proofs (missing dataset -> exit 1 + 0 rows; bogus actualRule -> warn + exit 0 + 300 rows; scratch DB dropped after); domain passthrough 1/1; persistence 13/13 on live Postgres; full pnpm test 79 files/1247 green.
- Findings: F-05/F-06/F-07 marked fixed by /implement; F-01..F-04 stay fixed; ledger now holds zero open findings and no P0/P1. Nothing resolved, so no Findings section is archived and the ledger is preserved verbatim for a later /audit re-review. No independent review (non-sensitive).
- Note: the captured sourceTree includes the user-owned unrelated .gitignore edit (+raw_content/), which is deliberately excluded from the work commit; the commit tree differs from sourceTree by exactly that path.
