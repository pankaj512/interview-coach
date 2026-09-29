# Feature: Loop verification

**From build-plan:** feature 19
**Build attempt:** 1
**Branch:** feature/loop-verification
**Status:** verified

## Goal

Prove the full practice loop works end to end against a live database — dashboard → lobby → live interview → evaluating → results → history/progress — and repair whatever the pass exposes. No new product functionality.

## In scope

- One repeatable loop harness: a backend integration test file that walks the whole API loop against a live `*_test` DB (register → profile → recommendations/current → create/start interview → submit code → run tests → submit-verdict (503-tolerant when keys absent) → end → evaluation → results reads → history/progress reads).
- Manual click-through of the same loop in the web client (dashboard → lobby → live room → evaluating → results → history/progress), recorded as pass/fail per leg.
- Minimal repairs for defects the pass exposes (broken links, stale reads, unreachable states). Each repair stays inside the loop path.
- Existing conventions only: `packages/backend/tests/helpers.ts` `buildTestBackend`, the `*_test` DB guard, `pnpm test`, `pnpm typecheck`, Vite build.

## Out of scope

- Automating the realtime voice session (no headless mic/keys in CI; unconfigured-503 paths already covered; manual live-try covers voice when keys exist).
- New product behavior, new endpoints, new screens, schema changes.
- Later build-plan items (V2 tracks) and unrelated defect repair — those go to `/fix`.

## Build loop

`workflow.stepReview: feature` — continue through passing steps, one final review packet. `/complete` owns the work commit. Gates are manual/when-sensitive; this work is verification-only, non-sensitive.

## Build steps

- [x] Step 1: API loop harness.
  - Add the integration test walking the full loop listed in scope; it must warn-and-pass without a DB (existing guard) and genuinely exercise persistence with one.
  - Seed needs: one user, profile topics, one problem with a runner link (shape-001 or equivalent), code that passes at least one sample.
  - Verdict leg asserts 200-with-verdict when keys exist, 503 `VERDICT_NOT_CONFIGURED` otherwise — never an invented verdict.
  - Done when: harness green against a migrated `interview_coach_test` DB; `pnpm typecheck` clean.
- [x] Step 2: run the pass, repair, re-run.
  - Run harness + full `pnpm test` + Vite build; click through every leg in the client; log each leg pass/fail.
  - Repair exposed loop defects minimally in the same branch; any defect outside the loop path goes to `/fix`, not here.
  - Done when: harness green, full suite green, build ok, every manual leg passes (or its `/fix` is filed and this spec notes it).
- [x] Step 3: final green pass and evidence.
  - Typecheck clean (this session); full suite 78/1246 green; web build ok (8GB flag); harness green on postgres repos and in-memory; user click-through passed all legs; scratch interview_coach_test DB dropped after the pass.
  - Done when: all gates green in one pass with nothing else touched.
**Status:** verified

## Files / areas

- New: one integration test under `packages/backend/tests/` (loop harness).
- Touched only if the pass exposes defects: the loop path (route → domain service → client screen on that leg).
- `blueprint/history/features/19-loop-verification.md` (archive target, attempt 1).

## Data / contracts

- No schema or API contract changes. The harness reads/writes through existing routes only (auth session owner, existing status machines, existing serializers).
- Test DB only (`interview_coach_test` + `ALLOW_DESTRUCTIVE_DB_TESTS`); never the dev DB.

## Testing

- `pnpm typecheck`, full `pnpm test` (77 files/1245 baseline — update the count if the harness adds files), web-client Vite build with the 8GB heap flag.
- Manual leg table: dashboard, lobby/Begin, live room (Test + Submit for Review), evaluating, results accordion, history, progress.

## Notes for the AI

- The realtime voice leg is covered by prior live tries (transcription, auto-finish, notify-finished); do not re-prove it here.
- If the harness exposes a defect needing a migration or a new endpoint, stop: that is scope expansion, file a `/fix` and note it.
- `verification.uiEvidence: when-available` — the manual click-through is the UI evidence; keep the leg table, skip screenshots unless a leg fails.

## Open questions

None. The one reversible choice (integration test file vs throwaway script) is settled for the test file: it stays repeatable for V2-3.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4566,"specSha256":"5553635f428d77d4dc907527312d504264e3ac524ec96ced50fdfe529305c4b0","branch":"refs/heads/feature/loop-verification","head":"36e20fae9b6bbd3823738d7e951cc327e4271027","baseRef":"refs/heads/main","baseCommit":"36e20fae9b6bbd3823738d7e951cc327e4271027","sourceTree":"119929cab5bb9efb482217188aa04f1709222781","absentOptional":[]} -->

## Completion

- Branch: feature/loop-verification, attempt 1 (head == base == main@36e20fa at archival).
- Changes: new packages/backend/tests/loop-verification.test.ts — one repeatable end-to-end pass over HTTP (register -> profile -> recommend -> accept -> create/assign/ready/start -> submit -> run -> submit-verdict -> end -> evaluation -> history/skills -> next recommendation) with deterministic fake models and code executor; memory-or-postgres repo resolution. No product code touched.
- Repairs during the build (all inside the harness): dropped the pnpm-unresolvable drizzle-orm import (liveness probe via repos.curricula.findById instead); corrected serialized run status completed -> passed; corrected history shape to nested {interview, evaluation}.
- Gates: pnpm typecheck clean; full pnpm test 78 files/1246 green; web-client Vite build ok (8GB heap flag); harness green in-memory and on migrated interview_coach_test (postgres repos confirmed; scratch DB dropped after the pass); user manual click-through passed every leg (dashboard, lobby/Begin, live room Test + Submit for Review, evaluating, results accordion, history).
- Findings: F-01..F-04 fixed (P2/P3) stay in ledger; F-05 P2 + F-06/F-07 P3 open; no P0/P1. No independent review (non-sensitive test-only addition).
