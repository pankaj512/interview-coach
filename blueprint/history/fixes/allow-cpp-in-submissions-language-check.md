# Fix: Allow cpp in submissions language check

**Type:** Fix
**Status:** verified
**Branch:** `fix/allow-cpp-in-submissions-language-check`

## The problem

C++ Test and Submit both die with `INTERNAL_ERROR: Unexpected backend error` and persist nothing. Debug (confirmed, 2026-09-28, live Majority Element interview `iv_53bb…`): the domain accepts `CodeLanguage = "javascript" | "python" | "cpp"` (`packages/domain/src/submission.ts:19-24`), but migration `0003_enum_checks.sql:10` still declares `CHECK ("language" IN ('javascript', 'python'))`. C++ support landed in code (items 16/18a.3) without migrating the constraint, so every C++ `submissions.save` throws a Drizzle CHECK violation that escapes as a 500 through the catch-all (`app.ts:538-555`). Reproduced against the dev DB in a rolled-back transaction (no data changed); the interview has 0 submission and 0 run rows. Python/JS are unaffected. All other `0003` enum CHECKs were audited against the domain unions — only `submissions_language_check` is stale.

## The fix

Hand-written migration `0011` (mirroring the `0003` hand-written precedent — `schema.ts` declares no `.check()`, so `drizzle-kit generate` cannot produce this): `DROP CONSTRAINT submissions_language_check` + re-`ADD CONSTRAINT` with `('javascript', 'python', 'cpp')`, plus the `_journal.json` idx-11 entry. Backend boot-migrates, so the dev DB picks it up on restart. No product-code change, no new abstraction. Must not break: existing Python/JS submissions, the boot-migrate path, `db:generate` determinism (schema snapshot untouched).

## Build steps

- [x] 1. Migration `0011` + journal entry for the widened language CHECK.
  Done when `db:migrate` applies cleanly on a throwaway `*_test` DB and the table definition shows all three languages.
- [x] 2. Live-DB regression test saving one submission per `CODE_LANGUAGES` value through `DrizzleSubmissionRepository`, using the existing `withDb` warn-and-pass pattern.
  Done when the test fails on the pre-`0011` schema and passes after migrating, with `pnpm typecheck` and the full suite green.

## Verify

- `pnpm typecheck`, `pnpm test` (full suite green), backend restart boot-migrates the dev DB without errors.
- Manual live try: C++ interview — Test sample cases returns a run, Submit for AI verdict returns a verdict, and both rows persist (this exact flow 500'd before the fix).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2383,"specSha256":"2d6010312f331cbfd7e7d7f606cea68b4bb1142f8e62cf3d78f44bb9d12d1c15","branch":"refs/heads/fix/allow-cpp-in-submissions-language-check","head":"bd79f26a35a70df3823983e370c6f70aaee09b8b","baseRef":"refs/heads/main","baseCommit":"bd79f26a35a70df3823983e370c6f70aaee09b8b","sourceTree":"c42429594c19dd71bfd4a97eb31ac61830a42593","absentOptional":[]} -->

## Completion record

Built 2026-09-28 on `fix/allow-cpp-in-submissions-language-check`, merged into `main` via squash.

- `packages/db/drizzle/0011_cpp_submission_language.sql` (new): `DROP CONSTRAINT submissions_language_check` + re-add with `('javascript', 'python', 'cpp')`.
- `packages/db/drizzle/meta/_journal.json`: idx-11 entry. `db:generate` reports "No schema changes" — snapshot untouched.
- `packages/db/tests/persistence.test.ts`: live-DB regression test submitting once per `CODE_LANGUAGES` value through `SubmissionService` + `DrizzleSubmissionRepository`.

Evidence: fail-before on a 0000–0010 scratch DB reproduced the production error (`violates check constraint "submissions_language_check"`, js/python inserts passed); pass-after `db:migrate` (table def shows all three languages) 1/1 green. `pnpm typecheck` clean, full `pnpm test` 77 files / 1219 green. No product-code change; widening cannot invalidate existing rows (all are js/python, still allowed).

Live proof pending user try: restart the backend so boot-migrate applies 0011 to the dev DB, then C++ Test + Submit should persist rows instead of 500ing. The auto-finish-on-disconnect follow-up (issue 3) is not part of this fix.
