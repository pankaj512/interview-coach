# Feature: Practice loop screens

**From build-plan:** feature 17b
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/fresh-web-client-ui-rebuild-17b`

## Goal

Second slice of the item 17 client rebuild: rebuild Dashboard, Lobby,
Live, and Evaluating from scratch on the approved mockups. All state
logic, hooks, voice wiring, and backend calls stay unchanged; only
markup and styles move to the prototype look on the 17a theme.

## Design reference

- `prototypes/dashboard.html`, `prototypes/lobby.html`,
  `prototypes/live.html`, `prototypes/evaluating.html` (layout, copy,
  states — mockup wins on disagreement)
- `prototypes/theme.css` (already ported; use canonical variable names,
  never hard-coded values)
- `docs/interview-coach-ui-specification.md` (locked target)

## In scope

- Rebuild `DashboardScreen` (loading / error+retry / ready states,
  greeting, recommendation CTA with Start practice + New suggestion,
  curriculum progress, strengths/focus, mastery table) keeping the
  `dashboard.ts` builders and `DashboardData` flow untouched.
- Rebuild `LobbyScreen` (recommendation card, mic + voice-session
  readiness state machine with checking/ready/denied/unsupported/error,
  begin/back/change-goal actions) keeping `SessionPlan`, `getReady`,
  and permission logic untouched.
- Rebuild `LiveScreen` (topbar with timer + LIVE indicator, problem +
  editor two-column, Test sample cases + End controls, voice-state rail
  with all five states, error state) keeping `useLiveInterview`,
  `CodeWorkspace`, `ProblemPanel`, and tool wiring untouched.
- Rebuild `EvaluatingScreen` (processing state with honest stages, no
  fake precision; failure note) keeping the `onBack` contract.
- Rewrite the `styles.css` rules these screens use; restyle shared
  `ds/primitives` + `ds/status` pieces they consume (Badge, Card, voice
  rail, wave, timer) without changing component APIs. Dead Stitch rules
  for other screens stay until 17d removes the remnants.
- Update the `render-smoke.test.tsx` cases for exactly these screens
  (Dashboard, Lobby, Live join state, ProblemPanel, Evaluating) to the
  new copy and markup. Tests follow the product.

## Out of scope

- Items 17c-17d screens, item 18 (problem pane stays title-only;
  `ProblemPanel` logic untouched), item 19, V2 work.
- Any change to `api/backend-client`, `voice/*`, `state/*` hooks,
  `dashboard.ts`/`lobby.ts` builders, backend APIs, or screen props
  contracts (`App.tsx` wiring unchanged).
- Browser tests (no `Browser tests` command declared).

## Build loop

One review packet at the end (`workflow.stepReview: "feature"`).
No checkpoint commits (`workflow.checkpointCommits: "disabled"`).
No `Verify` command is declared, so the gates are the project's real commands:
`pnpm typecheck` then `pnpm test` (live `*_test` DB when available, else the
suite's warn-and-pass path), plus `pnpm build` and the web-client build.

## Build steps

- [x] 1. Rebuild Dashboard. All three data states; prototype greeting,
  CTA, progress, strengths/focus, mastery copy.
  Done when the Dashboard render-smoke case passes with new-copy
  assertions and no old-Stitch class names remain in the component.
- [x] 2. Rebuild Lobby. Recommendation + checks two-column per
  `lobby.html`; every mic/session state reachable with its message and
  retry; begin/back/change-goal wired as before.
  Done when the Lobby render-smoke case passes and a class-coverage
  check shows no missing CSS for its markup.
- [x] 3. Rebuild Live. Topbar, problem/editor columns, voice rail with
  all five states, Test + End controls, error state; every hook and
  tool call preserved byte-for-byte in behavior.
  Done when the Live + ProblemPanel render-smoke cases pass and
  `tsc` reports no touched-file errors.
- [x] 4. Rebuild Evaluating. Honest processing stages (no fake
  precision), failure note, optional back action.
  Done when the Evaluating render-smoke case passes.
- [x] 5. Shared styles + final gates. Confirm no 17b screen references
  removed Stitch classes; leave other screens' rules for their slices.
  Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and the web-client
  build, all green in one clean run.
  Done when all four pass.

## Files / areas

- `packages/web-client/src/screens/DashboardScreen.tsx`,
  `packages/web-client/src/screens/LobbyScreen.tsx`,
  `packages/web-client/src/screens/LiveScreen.tsx`,
  `packages/web-client/src/screens/EvaluatingScreen.tsx`
- `packages/web-client/src/styles.css` (17b screens' rules + shared
  ds pieces they consume only)
- `packages/web-client/tests/render-smoke.test.tsx` (17b cases only)
- Reference (read-only): `prototypes/dashboard.html`,
  `prototypes/lobby.html`, `prototypes/live.html`,
  `prototypes/evaluating.html`, `docs/interview-coach-ui-specification.md`

## Data / contracts

None. No schema, migration, API, or persisted-data change. Screen props
contracts, hook behavior, and backend call shapes are unchanged.

## Testing

- Existing Vitest render-smoke suite, updated per rebuilt screen; no new
  test files (no new logic ships — pure presentation rewrite over kept
  wiring).
- `pnpm typecheck` is the lint gate and must exit 0; full suite plus both
  builds must stay green.
- If a step surfaces logic the suite never covered, add a focused test
  per the testing gate instead of silently skipping it.

## Notes for the AI

- Keep the diff off `api/`, `voice/`, `state/`, builders, and every
  17a/17c/17d screen or component.
- The mic/session state machine and voice rail states must all stay
  reachable; do not drop a state because the fixture cannot trigger it.
- Copy comes from the mockups and spec doc, not memory; old assertions
  must be replaced for touched screens, never weakened to pass.
- Do not delete `prototypes/` (17d owns that); do not touch `packages/`
  outside `web-client`.

## Open questions

- None. Screen list follows the approved 17b split.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":5923,"specSha256":"5993fd04ef573d28b4a7514ae51384aeea87b1f0f1a7d4a838f7b06c400db9eb","branch":"refs/heads/feature/fresh-web-client-ui-rebuild-17b","head":"f2466843cb4a047af776b3d6bc23e0c2780e2cf4","baseRef":"refs/heads/main","baseCommit":"f2466843cb4a047af776b3d6bc23e0c2780e2cf4","sourceTree":"59c065c498d2aa97dac7bc0e2daf4df60fb532bb","absentOptional":[]} -->
