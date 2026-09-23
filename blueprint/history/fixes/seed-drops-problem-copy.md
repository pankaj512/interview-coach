# Fix: Seed drops problem copy

**Type:** Fix
**Status:** verified
**Branch:** `fix/seed-drops-problem-copy`

## The problem

After `db:migrate` + `db:seed`, `GET /api/problems/prob_move-zeroes/content`
returns 200 with starters present but `description`/`constraints`/`examples`
all null — so the pane falls back to title-only despite the seed reporting
"enriched 300 problems". The dataset file has the copy; the seed never carries
it: `mergeDataset` in `packages/db/src/seed.ts` builds `starters` and
`runnerLinks` from the dataset record but lines 136-138 re-spread only the
catalog problem's own (title-only, undefined) copy fields. `DatasetProblem`
(lines 44-54) doesn't even declare the copy fields.

## The fix

Extend `DatasetProblem` with `description`/`constraints`/`examples`, validate
them the same way starters are validated (non-empty string / non-empty
string array / well-formed example objects; malformed falls back to gap, never
invented), and prefer the dataset copy in the `createProblem` rebuild,
keeping the catalog spread as fallback. Reseed the dev database and confirm
the content endpoint returns the statement for a spot-checked problem.
Must not change the starters/links merge, the gap-report contract, or the
upsert behavior.

## Build steps

- [x] 1. Carry dataset copy in `mergeDataset` — extend `DatasetProblem`,
  validate, prefer dataset copy in rebuild. Done when a focused test or seed
  dry-run proves an enriched record keeps its dataset description/constraints/
  examples and a malformed-copy record falls back to gap without crashing.
- [x] 2. Reseed + endpoint proof — migrate/seed the dev database and show
  `GET /api/problems/prob_move-zeroes/content` returning a non-null
  description. Done when the endpoint output is recorded.

## Verify

- `GET /api/problems/prob_move-zeroes/content` returns non-null description,
  constraints, and examples; pane shows the full statement.
- Root typecheck clean; full `pnpm test` green.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":1981,"specSha256":"4bf216293cf7f440c99648cdca6ecb1c845d135a0c6ca704d46d4016457f8109","branch":"refs/heads/fix/seed-drops-problem-copy","head":"57aea22d90d84fd53b094c522136ff3af892672e","baseRef":"refs/heads/main","baseCommit":"57aea22d90d84fd53b094c522136ff3af892672e","sourceTree":"6f0f8b7dad13889681f38108e3ca4684bae3a9b8","absentOptional":[]} -->

## Completion record

Work branch `fix/seed-drops-problem-copy` (base `main@57aea22`). One file
changed, no new dependency:

- `packages/db/src/seed.ts`: `DatasetProblem` declares
  `description`/`constraints`/`examples`; new `cleanCopyText` /
  `toCopyExample` / `toCopyConstraints` / `toCopyExamples` validators mirror
  the starters/links style; the rebuild prefers the dataset copy verbatim
  with per-field catalog fallback. Gap-report contract and upsert behavior
  unchanged.

Final gates (this session): `pnpm typecheck` clean, `pnpm test` 68 files /
1125 tests green. Live proof on the dev database (compose postgres :5433):
reseed `enriched 300, 0 title-only gaps`; `prob_move-zeroes` reads back
description "Given an integer array nums, move all 0's…" with 2 constraints
and 2 examples (psql read-back; tsx `-e` cannot resolve the TS sources).

No findings resolved by this fix; F-05 [P2] open plus F-06/F-07 [P3] open
stay verbatim in the ledger (F-05 is adjacent — destructive title-only
reseed — but untouched by this change). No independent review requested or
required (all regular gates manual; seed-only change, no new trust
boundary).
