# Fix: App.ts header cleanup and handler extraction

**Type:** Fix
**Status:** verified
**Branch:** fix/app-header-and-handler-extraction
**Fixes:** F-13, F-12

## The problem

F-13: `packages/backend/src/app.ts:1-54` opens with a 54-line header whose
route enumeration (lines 9-54) is already stale — it omits
`DELETE /api/learning-state` (registered at :810) and
`POST /api/interviews/:id/submit-verdict` (registered at :1386) — and
conflicts with the standards ban on banner/header blocks. `sandboxTestCaseSchema`
(:309-313) is also misformatted (first property on the declaration line).

F-12: `buildApp` (:371 onward, file is 1882 lines, 47 routes) inlines every
route handler. The largest — `POST .../voice-session` (:1700-1831, ~132
lines), `POST .../submit-verdict` (:1386-1473, ~88 lines),
`POST .../submissions/:subId/runs` (:1487-1559, ~73 lines), and
`POST .../tool-exec` (:1594-1664, ~71 lines) — make the module hard to
navigate, review, and test in isolation.

## The fix

F-13: delete the route enumeration (lines 9-54), keep the 8-line module
summary (lines 1-8); reformat `sandboxTestCaseSchema` to one property per
line. Out of scope: the niche `siblingSource` duplication in the two
shape-runner `assemble.ts` files stays as-is (optional part of the finding;
does not affect this repair).

F-12: move the four largest handlers into per-concern route modules (e.g.
`packages/backend/src/routes/voice-session.ts`,
`routes/submit-verdict.ts`, `routes/runs.ts`, `routes/tool-exec.ts`), each
exporting a `register*Routes(app, ctx)` function that `buildApp` calls with
the services, repos, and module helpers the handlers already use
(schemas, `zodMessage`, `toVerdictProblem`, `describeConfiguration`,
`describeProblem`, `errorBody`). Pure move: no behavior, route, status-code,
or response-shape change. Remaining handlers stay inline.

## Build steps

1. Delete the stale route enumeration and reformat `sandboxTestCaseSchema`.
   - Done when: no route list remains in the header, the schema is one
     property per line, and repo typecheck passes.
2. Extract the four largest handlers into per-concern route modules
   registered by `buildApp`.
   - Done when: the four handler bodies live in `routes/` modules,
     `app.ts` only registers them, and repo typecheck passes.

## Verify

- Repo `pnpm typecheck`, full `pnpm test` (backend route tests cover the
  moved handlers; no test changes expected), and `pnpm build` all green.
- Manual: `GET /api/health` plus one moved route (e.g. voice-session flow)
  behave as before — covered by the existing suite, no new tests.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2602,"specSha256":"df5ee88a8738fca6cdf3f698b6d5722f2936c2d33d6dabe905f68b827cc41194","branch":"refs/heads/fix/app-header-and-handler-extraction","head":"2723792baa37e483db280765595202884c59e76d","baseRef":"refs/heads/main","baseCommit":"2723792baa37e483db280765595202884c59e76d","sourceTree":"1e9603191ce922d7ba8b34286e7d8945b8306c3e","absentOptional":[]} -->
