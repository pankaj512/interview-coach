# 18c. Problem-content API and client wiring — completed

**Build attempt:** 1
**Branch:** `feature/problem-content-api-and-client-wiring` (deleted after merge)
**Merged to main:** local only (push declined)

## What was built

Dedicated problem-content endpoint plus pane adoption, leaving existing
routes and the Test execution path untouched:

- `GET /api/problems/:id/content` in `packages/backend/src/app.ts`, mirroring
  the sibling detail route's id validation (400) and 404
  (`Problem <id> does not exist`); replies `{ok: true, content}`.
  Existing `GET /api/problems/:id` left byte-identical.
- `SerializedProblemContent` / `serializeProblemContent` in
  `packages/backend/src/serializers.ts`: the content slice (description,
  constraints, examples, starters, runnerLinks) with explicit nulls for
  title-only gap problems.
- Web-client `ProblemContent` types (`api/types.ts`) and `getProblemContent`
  (`api/backend-client.ts`) following the existing backend-client patterns.
- `ProblemPanel` content tri-state (loading → fetch-failed fallback → ready
  with null-as-gap), all-examples list; `CodeWorkspace` verbatim-starter
  prefill via `starterForLanguage` with a dirty-guard effect that never
  clobbers edits; `LiveScreen` fetches content per problem id and wires both.
- Tests: backend `problem-content.test.ts` (enriched / gap / 404), client
  `backend-client-content.test.ts` (contract incl. null starters),
  `starterForLanguage` units, `ProblemPanel` render tests.

## Verification evidence

- Backend content tests 3/3; client content tests 2/2; client render/unit
  tests 34/34 green (implement session).
- `pnpm typecheck` clean; full `pnpm test` 68 files / 1125 tests green
  (rerun in `/complete`).
- Gates manual / when-sensitive; additive endpoint-plus-client work, no
  migration or auth change — no independent review selected, no `/check` run.

## Active spec at completion

Spec `a9c33ca4` (4261 bytes), Status: verified, 4/4 steps checked. Full text:

# Feature: Problem-content API and client wiring

**Status:** verified
**From build-plan:** feature 18c
**Build attempt:** 1
**Branch:** `feature/problem-content-api-and-client-wiring`

## Goal

Expose the reseeded problem content (statement, examples, verbatim starters,
runner links) through dedicated problem-content endpoint(s) and adopt them in
the problem pane, which today renders title-only. The editor prefills the
verbatim starter for the active language. Existing routes and the Test
execution path stay untouched.

## In scope

- New dedicated content endpoint(s) under `/api/problems/:id` serving the
  content slice (description, constraints, examples, starters, runner links).
- Problem-pane adoption: statement, examples list, and editor prefill from the
  verbatim starter when present; title-only fallback preserved for gap
  problems (missing starters).
- Loading, unknown-id, gap, and unexpected-error states for the new fetch.

## Out of scope

- Test execution via shape runners (Open question below; Test path unchanged).
- Retiring old endpoints, Submit (18d), hidden tests, singleton inline
  runners, full-300-vs-gap-list (carried questions).

## Build loop

`workflow.stepReview` is `feature`: continue through passing steps, one final
review packet. Checkpoint commits disabled; `/complete` owns the work commit.

## Build steps

- [x] 1. Content endpoint — add the dedicated content route(s) mirroring the
  existing `/api/problems/:id` auth, id validation, and 404 pattern; unknown
  id → 404 via the existing http-errors path, gap problem → 200 with available
  fields and null starters. Done when a backend test proves the content shape
  for an enriched problem, 404 for unknown id, and the gap shape.
- [x] 2. Client content fetch — extend the web-client API types and fetch
  layer with the content contract (no silent `any`), following the existing
  backend-client patterns. Done when a client test proves the fetch maps the
  contract including the null-starter gap case.
- [x] 3. Pane adoption — ProblemPanel loads statement/examples from the new
  endpoint (loading state while fetching, unexpected-error path on failure),
  and the editor prefills the verbatim starter for the active language when
  present, keeping the current empty-editor behavior otherwise. Done when the
  pane shows statement + examples + prefilled starter for an enriched problem
  and title-only for a gap problem, proven by the repo's client tests where
  they cover rendering, otherwise by typecheck plus a manual try path.
- [x] 4. Validation gate — root typecheck clean and full `pnpm test` green.
  Done when both outputs are recorded with no new failures.

## Files / areas

- `packages/backend/src/` — problems routes, serializers, http-errors (mirror
  existing patterns)
- `packages/backend/tests/` — endpoint tests alongside intelligence/interviews
- `packages/web-client/src/api/` — types + backend-client fetch
- `packages/web-client/src/` — ProblemPanel, editor prefill site
- `packages/web-client/tests/` — client contract tests

## Data / contracts

- Content slice: `{ description, constraints, examples, starters, runnerLinks }`
  with `starters` null for title-only gap problems.
- Method-sequence links store `entry: ""` verbatim (frozen 18a decision); the
  pane never invents an entry.
- No persisted-data or migration changes; reads the 18b columns only.

## Testing

- Backend endpoint tests (enriched / unknown-id 404 / gap shape).
- Client fetch tests (contract mapping incl. null starters).
- No browser command exists: no browser coverage; behavior proven via tests.

## Notes for the AI

- The domain problem already carries starters/runnerLinks post-18b; the new
  endpoint(s) are a dedicated content view, not a reuse of the list/detail
  routes — leave existing routes byte-identical.
- `assemble*Run` are unwired server-side; 18c does not wire execution.

## Open questions

1. Test-via-shape-runners wiring: does a later slice route Test through the
   shape-runner library, or keep the solve-based sandbox path? (Needs a product
   decision; assumed unchanged here.)
2. Full-300 vs gap-list for title-only problems (carried from 18a/18b).
3. Singleton inline runners (carried from 18a).

## Open questions (carried, unresolved)

1. Test-via-shape-runners wiring (spec open question 1) — needs a product
   decision before any execution-path change.
2. Full-300 vs gap-list for title-only problems (carried from 18a/18b).
3. Singleton inline runners (carried from 18a).
