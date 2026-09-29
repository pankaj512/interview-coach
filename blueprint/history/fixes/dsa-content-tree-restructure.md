# Fix: DSA content tree restructure

**Type:** Fix
**Status:** verified
**Branch:** fix/dsa-content-tree-restructure

## The problem

`content/` is becoming the application-content root with one subtree per track
(`dsa/`, later `system-design/`). The current DSA layout predates that: the
curriculum sits a level too deep (`content/dsa/curriculum/`), the enrichment
dataset lives at the repo root, and the ~30 per-topic dirs sit directly under
`content/dsa/`. Target layout (dsa only; system-design lands with its files):

```text
content/
  dsa/
    dsa-interview-curriculum.json
    problem-content-enrichment.json
    problems/
      <topic>/<problem>/…   (today's content/dsa/<topic>/… moved verbatim)
```

`raw_content/dsa/` (catalog seed source) is out of scope and stays as-is.

## The fix

- Plain `mv` (all local files are git-ignored, no history to preserve):
  `content/dsa/curriculum/dsa-interview-curriculum.json` → `content/dsa/`
  (remove the now-empty `curriculum/` dir);
  `problem-content-enrichment.json` (repo root) → `content/dsa/`;
  `content/dsa/<topic>/` → `content/dsa/problems/<topic>/` for every topic dir.
- Update the 4 curriculum resolutions to `../../../content/dsa/dsa-interview-curriculum.json`:
  `packages/db/src/seed.ts`, `packages/backend/tests/helpers.ts`,
  `packages/domain/tests/curriculum.test.ts`, `packages/db/tests/persistence.test.ts`.
- Update the 5 enrichment defaults to `../../../content/dsa/problem-content-enrichment.json`:
  `seed.ts` (`datasetPath`), `javascript-/python-/cpp-runners.test.ts`,
  `packages/db/tests/problem-content.test.ts`. `PROBLEM_CONTENT_PATH` override
  behavior unchanged.
- Update stale path comments naming either old location (domain
  `catalog.ts`/`selection.ts`/`problem.ts`/`curriculum.ts`, `seed.ts` header).
- Must not break: `db:seed`, the file-backed suites, the backend Dockerfile
  (it copies only `raw_content/`, untouched), and the all-ignored tracking
  state (no new tracked files; empty `system-design/` is NOT scaffolded).

## Build steps

- [x] Step 1: moves + path/comment updates.
  - Done when: `grep -rn "content/dsa/curriculum\|problem-content-enrichment.json" packages/ --include="*.ts" | grep -v "content/dsa/problem-content-enrichment"` is empty of old
    locations; every moved file byte-identical at its new home; `pnpm
    typecheck` clean; full `pnpm test` green.

## Verify

- `grep` above shows only the new locations; `ls content/dsa/` shows the two
  JSONs + `problems/`; `db:seed` still resolves both files; full suite green.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2549,"specSha256":"4766dc02adb32ae901bb54424ca60c4389501d7f63c18adee63915c638f72834","branch":"refs/heads/fix/dsa-content-tree-restructure","head":"2022db28e9bf312df4688c9a37b6ffe5536b00ea","baseRef":"refs/heads/main","baseCommit":"2022db28e9bf312df4688c9a37b6ffe5536b00ea","sourceTree":"5168dee27a9fdf7b033a0c1cbb5e6260ddfecaa2","absentOptional":[]} -->

## Completion

- Branch: fix/dsa-content-tree-restructure (head == base == main@2022db2 at archival).
- Moves (plain mv, all git-ignored, byte-identical): curriculum content/dsa/curriculum/dsa-interview-curriculum.json -> content/dsa/ (empty curriculum/ dir removed); repo-root problem-content-enrichment.json -> content/dsa/ (tracked deletion of the root copy); 59 topic dirs content/dsa/<topic>/ -> content/dsa/problems/<topic>/ verbatim. Bulk-move loop harmlessly refused problems -> problems/problems; layout verified (no nesting).
- Tracked changes: 4 curriculum resolutions (db seed.ts, backend helpers.ts, domain curriculum.test.ts, db persistence.test.ts) -> ../../../content/dsa/dsa-interview-curriculum.json; 5 enrichment defaults (seed.ts datasetPath, js/py/cpp-runners tests, db problem-content.test.ts) -> ../../../content/dsa/problem-content-enrichment.json; stale comments in seed.ts header + domain selection.ts/curriculum.ts.
- Untouched per spec: raw_content/dsa/, backend Dockerfile (copies only raw_content/), all-ignored tracking state, no system-design/ scaffold.
- Gates: old-location grep across packages/ empty; new enrichment path in exactly 5 files; pnpm typecheck clean; 5 file-backed suites 626 green; full pnpm test 79 files/1247 green. Live db:seed not run (writes dev DB; resolution proven by suites).
- Findings: F-01..F-07 all fixed, no P0/P1. No independent review (non-sensitive path-only change).
- Follow-up discussion (no code): enrichment-vs-catalog as single seed source needs difficulty+topic backfill first; offered as a future /fix.
