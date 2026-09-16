# Feature: Web client UI prototype

**From build-plan:** feature 15
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/web-client-ui-prototype`

## Goal

Finish the throwaway static prototype so it covers the full DSA-only,
voice-only ritual flow, then rewrite `docs/interview-coach-ui-specification.md`
to match the approved prototype. The updated spec doc plus the approved
prototype become the locked target item 17 rebuilds against. No production
code changes.

## Design reference

- `prototypes/theme.css` (approved in `4aabc07`; warm-editorial minimal,
  forest-green primary, terracotta danger) is the single theme source. Every
  mockup pulls colors, fonts, and spacing from its variables, never hard-coded.
- `prototypes/dashboard.html`, `prototypes/lobby.html`,
  `prototypes/live.html`, `prototypes/results.html` (approved in `4aabc07`)
  are the established look reference for new screens.
- Prototype skill: `.agents/skills/prototype/SKILL.md` (plain HTML + CSS only,
  realistic dummy content, desktop-first; mockups are discarded at item 17's
  `/complete`, `theme.css` ports into the app).

## In scope

- New static mockups under `prototypes/` for the ritual-flow screens missing
  there: landing, onboarding (sign-in / create-account), evaluating,
  transcript review, history, progress, weak-areas, settings. Each mockup
  links `theme.css` and shows the states that matter for that screen
  (representative loading, empty, and error states, not just the happy path).
- One consistency pass: every mockup (existing + new) uses only
  `theme.css` variables for color, font, and spacing.
- Rewrite of `docs/interview-coach-ui-specification.md` to match the approved
  prototype: DSA-only voice-only MVP scope (per `41cffa0`), the ritual flow
  confirmed or replaced (resolves the `project-overview.md` open question),
  v2-future tracks/modes stay marked future, dropped Stitch/Penpot tracks stay
  out (per `docs/SESSION_HANDOFF.md`: that track is dropped, landed code
  stays as-is).
- The screen list above is confirmed at spec review; the reviewer may
  add, drop, or reorder screens there.

## Out of scope

- Items 16-19 and V2 work. In particular item 17 (real client rewrite),
  item 18 (problem statements/samples/boilerplate: problem pane stays
  title-only), and any change under `packages/`.
- New theme direction: `theme.css` tokens are approved and stay fixed unless
  review explicitly reopens them.
- Browser tests (no `Browser tests` command declared).

## Build loop

One review packet at the end (`workflow.stepReview: "feature"`).
No checkpoint commits (`workflow.checkpointCommits: "disabled"`).
No `Verify` command is declared, so the gates are the project's real commands:
`pnpm typecheck` then `pnpm test` (live `*_test` DB when available, else the
suite's warn-and-pass path). These prove nothing broke; there is no logic to
test.

## Build steps

- [x] 1. Gap audit. Compare `prototypes/` against the ritual flow in
  `project-overview.md` UI/UX (`/` landing -> sign-in -> onboarding ->
  dashboard -> lobby -> live -> evaluating -> results -> history / progress /
  weak-areas / settings). Record the missing-screen list in the review packet;
  if it differs from the In-scope list, stop and revise the spec.
  Done when the packet names each missing screen and its key states.
- [x] 2. Mock landing + onboarding. Add `prototypes/landing.html` and
  `prototypes/onboarding.html` (sign-in / create-account, pre-auth context
  capture, dev-mode bypass note) in the approved look, with realistic dummy
  content. Done when both files exist, link `theme.css`, and render their
  primary state plus one empty/error variant.
- [x] 3. Mock evaluating + transcript. Add `prototypes/evaluating.html`
  (loading/processing state) and `prototypes/transcript.html` (review state).
  Done when both files exist, link `theme.css`, and the evaluating mockup
  shows processing while transcript shows a populated review.
- [x] 4. Mock history + progress + weak-areas. Add the three files with
  believable rows/stats, plus one empty state (e.g. no interviews yet).
  Done when all three exist, link `theme.css`, and the empty state renders.
- [x] 5. Mock settings. Add `prototypes/settings.html` (account section,
  history clearing, sign-out) consistent with the approved screens.
  Done when the file exists, links `theme.css`, and covers its primary state.
- [x] 6. Token consistency. Grep every `prototypes/*.html` for hard-coded
  color/font values outside `theme.css` variables and fix stragglers.
  Done when no hex/rgb/font-family literal remains except inside
  `theme.css` itself.
- [x] 7. Rewrite the UI spec doc. Update
  `docs/interview-coach-ui-specification.md` to the prototype: confirmed
  ritual flow (or its recorded replacement), per-screen layout/behavior
  matching the mockups, DSA-only voice-only constraints, v2 tracks still
  future, dropped Stitch/Penpot references removed.
  Done when every ritual-flow screen in the doc matches its mockup and no
  section describes removed UI or the dropped tool tracks.
- [x] 8. Final gates. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`,
  all green (proves the docs/static-only diff broke nothing).
  Done when all three pass in one clean run.

## Files / areas

- `prototypes/landing.html`, `prototypes/onboarding.html`,
  `prototypes/evaluating.html`, `prototypes/transcript.html`,
  `prototypes/history.html`, `prototypes/progress.html`,
  `prototypes/weak-areas.html`, `prototypes/settings.html` (new)
- `prototypes/theme.css`, `prototypes/dashboard.html`,
  `prototypes/lobby.html`, `prototypes/live.html`,
  `prototypes/results.html` (read-only reference; touch only for step 6
  token fixes)
- `docs/interview-coach-ui-specification.md` (rewrite target)
- Reference (read-only): `blueprint/context/project-overview.md` UI/UX +
  Open questions, `docs/SESSION_HANDOFF.md` UI sections (dropped-track
  context), `docs/ui-rebuild-v1.1-plan.md` (kept history, not a target)

## Data / contracts

None. No schema, migration, API, or persisted-data change. Static files only.

## Testing

- No logic ships, so no new tests. `coding-standards.md` scope rule covers
  this: UI surfaces are verified by inspection and build, not unit tests.
- `pnpm test` (Vitest, 58 files / 444 passing) plus `pnpm typecheck` and
  `pnpm build` must stay green as the no-regression gate.
- If any step surfaces logic the suite never covered (not expected for
  static mockups), add a focused test per the testing gate instead of
  silently skipping it.

## Notes for the AI

- Keep the diff to `prototypes/` + the one doc. Never touch `packages/`.
- Mockups are throwaway reference: realistic dummy content, desktop-first,
  a few lines of inline JS for a view toggle at most.
- Do not resurrect the dropped Stitch/Penpot tracks in the doc; cite the
  handoff decision and move on.
- The overview open question "ritual flow survives the prototype, or record
  its replacement" is answered by step 7; say which in the review packet.

## Open questions

- Screen list: the 8 new mockups above are the default. Confirm, add, drop,
  or reorder at spec review before implementing.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":7173,"specSha256":"4486fcc839182a2403f853872128f458e02e99bd707632964fb7206e6f6db815","branch":"refs/heads/feature/web-client-ui-prototype","head":"060999f9873e8126099aac77d0559f39e266ec4c","baseRef":"refs/heads/main","baseCommit":"060999f9873e8126099aac77d0559f39e266ec4c","sourceTree":"7eb7427e7e0ad2279d4853fba6962c5fdda89857","absentOptional":[]} -->
