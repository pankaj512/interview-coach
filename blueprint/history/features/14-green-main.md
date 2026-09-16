# Feature: Green main

**From build-plan:** feature 14
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/green-main`

## Goal

Make `main` green again: `pnpm typecheck` exits 0 and `pnpm test` passes,
repairing the 2 known typecheck errors and the 3 resulting test failures left
by the Stitch v1.1 restyle batch. No production behavior changes.

## In scope

- `packages/backend/tests/learning-loop.test.ts` - stale evaluation dimension key.
- `packages/web-client/tests/render-smoke.test.tsx` - `HistoryEntry` fixture
  missing `evaluationStatus`, plus Dashboard/Onboarding copy-drift assertions.
- Test-only changes. If any failure traces to production source (not stale
  test expectations), stop and re-scope as a `/fix`; do not expand this feature.

## Out of scope

- Items 15-19, V2 work, UI redesign, backend or client behavior changes.
- Browser tests (no `Browser tests` command declared).

## Build loop

One review packet at the end (`workflow.stepReview: "feature"`).
No checkpoint commits (`workflow.checkpointCommits: "disabled"`).
No `Verify` command is declared, so the gates are the project's real commands:
`pnpm typecheck` then `pnpm test` (live `*_test` DB when available, else the
suite's warn-and-pass path).

## Build steps

- [x] 1. Fix the `learning-loop` dimension key. In
  `packages/backend/tests/learning-loop.test.ts`, the `ScoreEvaluationModel`
  proposal uses `understanding`, which is not in the canonical
  `EvaluationDimension` union (`problem_understanding`, `approach`,
  `communication`, `coding`, `testing_debugging`, `complexity_analysis`,
  `independence` in `packages/domain/src/evaluation.ts:10`). Rename it to
  `problem_understanding`; leave `approach`, `coding`, `independence` as-is.
  Done when `tsc` no longer reports `learning-loop.test.ts(51,11)`.
- [x] 2. Fix the `render-smoke` history fixture. The `HistoryEntry` fixture
  (~line 87) is missing required `evaluationStatus`. Add
  `evaluationStatus: "completed"`, consistent with the entry's scores.
  Done when `tsc` no longer reports `render-smoke.test.tsx(88,3)`.
- [x] 3. Resolve the copy-drift failures. Run `pnpm test`; for each remaining
  failure asserting pre-restyle copy (known: Dashboard "Recommended next",
  Onboarding "Set up your profile"), update the assertion to the landed copy.
  Tests follow the product, not the reverse. Done when the full suite is
  green and no assertion references removed UI copy.
- [x] 4. Final gates. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  `pnpm --filter @interview-coach/web-client build`, all green.
  Done when all four pass in one clean run.

## Files / areas

- `packages/backend/tests/learning-loop.test.ts`
- `packages/web-client/tests/render-smoke.test.tsx`
- Reference (read-only): `packages/domain/src/evaluation.ts`
  (canonical dimensions), `packages/web-client/src/history.ts`
  (`HistoryEntry.evaluateStatus` values)

## Data / contracts

None. No schema, migration, API, or persisted-data change.

## Testing

- The project's test command (`pnpm test`, Vitest) is both the subject and
  the gate: the suite must be green before approval and before `/complete`.
- `pnpm typecheck` is the lint gate and must exit 0.
- Stale-expectation fixes only; no new test files needed. If step 3 surfaces
  logic the suite never covered (not just copy), add a focused test in the
  same file per the testing gate in `coding-standards.md`.

## Notes for the AI

- Keep the diff test-only. Resist "fixing forward" in production code.
- `evaluationStatus: "completed"` matches the fixture's scores; if
  `history.ts` mapping suggests another value for scored entries, use it and
  say so in the review packet.
- The 3 runtime failures were reported in `docs/SESSION_HANDOFF.md` (UI batch
  section), not directly observed here; step 3 confirms the actual list via a
  real `pnpm test` run.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3866,"specSha256":"b58a2aa6e72df044b52c9452060f5401d1ecc316451408d6008e623e561835b9","branch":"refs/heads/feature/green-main","head":"4aabc07fb43181600cc9ac795c077159300a2108","baseRef":"refs/heads/main","baseCommit":"4aabc07fb43181600cc9ac795c077159300a2108","sourceTree":"1932b482272e581d9939482678d1b68484412705","absentOptional":[]} -->
