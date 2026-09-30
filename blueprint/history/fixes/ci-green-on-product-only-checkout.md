# Fix: CI green on product-only checkout

**Type:** Fix
**Status:** verified
**Branch:** fix/ci-product-only-seed-skip

## The problem

`content/`, `raw_content/`, and `scripts/` are gitignored, so a fresh
checkout (GitHub CI included) has product code but none of the three seed
JSONs the suite reads from disk:

- `raw_content/dsa/dsa-problem-catalog.json` (via `seedCurriculum` in
  `packages/backend/tests/helpers.ts` and directly in db/domain tests)
- `content/dsa/dsa-interview-curriculum.json`
- `content/dsa/problem-content-enrichment.json` (via `PROBLEM_CONTENT_PATH`
  default in the runner suites and `packages/db/tests/problem-content.test.ts`)

Result on CI: 24 failed tests plus 5 failed suites (the `*-runners`,
`problem-content`, and domain `curriculum` suites read their files at module
scope, so they fail collection). Separately, `packages/backend/Dockerfile`
has `COPY raw_content/dsa/dsa-problem-catalog.json ...`, which fails
`docker build` on any checkout without that gitignored file (including the
CI `containers` job). Per the Sep 29 decision the data dirs stay ignored and
files are supplied out of band, so CI must verify the product without them.

## The fix

Make the suite product-only capable, mirroring the existing DB
warn-and-pass pattern (`packages/db/tests/helpers.ts` `withDb`): when a seed
file is absent, the affected suite warns and skips instead of throwing
ENOENT. Concretely:

- Add one small shared guard (for example `seedDataAvailable()` /
  `readSeedJsonOrNull()`) near the existing test helpers; reuse it from
  backend `seedCurriculum`, the three `*-runners` suites, db
  `problem-content` + `persistence` curriculum test, and domain
  `curriculum` test. Module-scope reads become load-or-null with
  `describe.skipIf` (or equivalent); in-test reads become warn-and-return.
- `packages/db/src/seed.ts` keeps its abort on missing dataset (F-05); that
  is the real-seed path and must stay loud.
- Backend Dockerfile: drop the `COPY raw_content/...` line (it can never
  resolve on a product-only checkout, and container seed is already
  incomplete because curriculum + enrichment are not copied). Update the
  adjacent comment so seeding points at a host checkout with the files
  (`pnpm --filter @interview-coach/db db:seed` with `DATABASE_URL` aimed at
  the stack DB).
- Must not break: full-data local runs (all suites execute as today when the
  files exist), the F-05 seed abort, Docker layer-cache order, and the
  all-ignored tracking state (no data files committed).

## Build steps

- [x] Step 1: skip guards in all file-backed suites.
  - Done when: with the three JSONs temporarily moved aside, `pnpm test`
    is green with visible skip warnings and zero ENOENT failures; with the
    files restored, the same suites execute fully (no skips).
- [x] Step 2: Dockerfile builds without the catalog file.
  - Done when: `docker build -f packages/backend/Dockerfile .` succeeds on
    a product-only checkout, and the seeding comment names the host-side
    command.

## Verify

- `pnpm typecheck` clean.
- Product-only simulation: `mv raw_content /tmp/ic-raw && mv content /tmp/ic-content`
  then `pnpm test` (expect green with skip warnings), then move both back
  and re-run the touched suites to prove they still execute.
- `docker build -f packages/backend/Dockerfile -t interview-coach-backend:ci .`
  on the product-only tree.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3392,"specSha256":"61b958982da10ec9babc4a110d0f501653c21e432ff389b011eabc503a10d2b0","branch":"refs/heads/fix/ci-product-only-seed-skip","head":"dd72bd9ef26ffe6bcb4279f5c38d4157b5f5932b","baseRef":"refs/heads/main","baseCommit":"dd72bd9ef26ffe6bcb4279f5c38d4157b5f5932b","sourceTree":"a7991691c2b0a9434c55fc93d3e9f156cf1b3fc7","absentOptional":[]} -->

## Completion

- Branch: fix/ci-product-only-seed-skip (head == base == main@dd72bd9 at archival).
- Changes: packages/backend/tests/helpers.ts - seedCatalogPath/seedCurriculumPath exports, seedDataAvailable() guard, seedCurriculum warns and returns false instead of throwing ENOENT. packages/db/tests/helpers.ts - same guard plus seedDatasetPath. Skip wiring: curriculum/recommendation/skill-update/learning-loop describes and transcript linkage describe via describe.skipIf; voice-session, loop-verification, and 3 session-context tests via it.skipIf; cpp/javascript/python runner suites and db problem-content gate via load-or-null plus describe.skipIf (explicit PROBLEM_CONTENT_PATH still loads loudly); domain curriculum test via load-or-null plus per-test skipIf; db persistence curriculum test via warn-and-return inside withDb. packages/backend/Dockerfile - dropped COPY of the gitignored catalog, seeding documented as host-side db:seed. seed.ts abort (F-05) untouched.
- Gates: pnpm typecheck clean; pnpm build (tsc -b) clean; with data: domain curriculum + db problem-content + backend curriculum/session-context 25/25, recommendation/skill-update/learning-loop/loop-verification/voice-session suites green, runner gates 613/613; product-only simulation (content + raw_content moved aside): file-backed suites skip with warnings, zero ENOENT; docker build of the backend image succeeds on the product-only tree. No audit, independent review, check, or try guide selected (test-only change, no trust boundary touched).
- Findings: F-01..F-14 stay fixed; no P0 or P1 open or fixed. Nothing resolved, so no Findings section is archived and the ledger is preserved verbatim for a later /audit re-review.
- Known risk (pre-existing, out of scope): transcript.test.ts history-listing newest-first ordering flakes intermittently on identical timestamps; reproduced on the pristine base via stash.
