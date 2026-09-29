# Fix: Seed JSONs live under raw_content/dsa and content/dsa/curriculum

**Type:** Fix
**Status:** verified
**Branch:** fix/seed-jsons-under-raw-content-dsa

## The problem

The canonical seed datasets sat at the repo root. Per user direction they are
split by role: `dsa-problem-catalog.json` is raw source material (housed under
`raw_content/dsa/`, still read at seed-time by `seed.ts` and test suites);
`dsa-interview-curriculum.json` is application-consumed ordering (housed under
`content/dsa/curriculum/`, alongside the existing per-topic content tree).
Additionally, `.gitignore` excluded both `raw_content/` and `content/`, which
would silently untrack the seed data (user chose to keep them tracked).

## The fix

- `git mv` the catalog to `raw_content/dsa/` and the curriculum to
  `content/dsa/curriculum/` (history-preserving).
- Catalog resolutions → `../../../raw_content/dsa/dsa-problem-catalog.json`:
  `packages/db/src/seed.ts`, `packages/backend/tests/helpers.ts`,
  `packages/domain/tests/curriculum.test.ts`, `packages/db/tests/persistence.test.ts`,
  `packages/db/tests/problem-content.test.ts`.
- Curriculum resolutions →
  `../../../content/dsa/curriculum/dsa-interview-curriculum.json`: `seed.ts`,
  `helpers.ts`, `curriculum.test.ts`, `persistence.test.ts`.
- Backend Dockerfile: `COPY raw_content/dsa/dsa-problem-catalog.json
  ./raw_content/dsa/dsa-problem-catalog.json` (destination preserves the
  `../../../` layout seed.ts relies on in both tsx and image runtime).
- `.gitignore`: `raw_content/` → `raw_content/*` + `!raw_content/dsa/`;
  `content/` → `content/*` + `!content/dsa/` + `content/dsa/*` +
  `!content/dsa/curriculum/` — only the two seed locations are tracked.
- Stale location comments updated (`seed.ts`, `catalog.ts`, `curriculum.ts`,
  `problem.ts`, `selection.ts`). Docs prose and the `source_catalog` display
  string inside the curriculum JSON stay untouched.
- Must not break: seed abort/warn behavior (F-05–F-07), Docker layer caching
  order (JSON COPY stays on its own layer line).

## Build steps

- [x] Step 1: catalog under raw_content/dsa, all catalog paths, Dockerfile COPY, raw_content ignore scoping, comments.
  - Done when: no `../../../dsa-` resolutions remain outside the two new homes,
    both files staged as renames, JSONs tracked. (Met.)
- [x] Step 2: curriculum to content/dsa/curriculum, its four resolutions, content ignore scoping, curriculum comments.
  - Done when: `grep -rn "raw_content/dsa/dsa-interview-curriculum" packages/`
    is empty, `git status` shows the curriculum renamed (R) and tracked, and
    the catalog half is unchanged.

## Verify

- `pnpm typecheck`, focused seed/catalog/curriculum/persistence suites, full
  `pnpm test`, and `git status` shows both seed JSONs tracked at their new homes.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2802,"specSha256":"3b5e8b4dd04568b3a90ce54911e0388bf6ff99c7dae8e02b0bb02d71e8669e21","branch":"refs/heads/fix/seed-jsons-under-raw-content-dsa","head":"fb2756df03bec5b6cb88c40b3e847143050db7f1","baseRef":"refs/heads/main","baseCommit":"fb2756df03bec5b6cb88c40b3e847143050db7f1","sourceTree":"029ba53596c84212f92c33f28d032b5a3fe8943c","absentOptional":[]} -->

## Completion

- Branch: fix/seed-jsons-under-raw-content-dsa (head == base == main@fb2756d at archival).
- Layout (revised mid-build per user): dsa-problem-catalog.json -> raw_content/dsa/ (raw seed-time source; seed and tests still read it); dsa-interview-curriculum.json -> content/dsa/curriculum/ (app-consumed ordering). Content-identical moves.
- Paths: catalog resolutions -> ../../../raw_content/dsa/ (seed.ts, backend helpers, curriculum/persistence/problem-content tests); curriculum resolutions -> ../../../content/dsa/curriculum/ (seed.ts, helpers, curriculum + persistence tests).
- Backend Dockerfile COPY repointed with destination preserving the ../../../ layout; location comments updated; docs prose and source_catalog string untouched.
- Tracking (final user decision, supersedes the spec TRACKED-OK done-when): both dirs stay git-ignored. .gitignore gains plain raw_content/ (content/ already ignored). The commit deletes the two root JSONs from tracking; the new locations stay untracked+ignored. Consequence: fresh clones lack seed data (db:seed needs the files; backend image build COPY of raw_content breaks; file-dependent tests fail without them) — files must be supplied out of band.
- Gates: pnpm typecheck clean (incl. in-session re-run); focused suites 26/26; full pnpm test 79 files/1247 green (all with files on local disk).
- Findings: F-01..F-07 all fixed, none open, no P0/P1. No independent review (non-sensitive move).
