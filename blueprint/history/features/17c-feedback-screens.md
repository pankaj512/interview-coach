# Feature: Feedback screens

**From build-plan:** feature 17c
**Build attempt:** 1
**Branch:** `feature/feedback-screens`
**Status:** verified

## Goal

Third slice of the item 17 client rebuild: rebuild Results, Transcript
review, Feedback detail, and Weak areas from scratch on the approved
mockups. All state logic, hooks, polling, voice wiring, and backend calls
stay unchanged; only markup and styles move to the prototype look on the
17a theme. Score display standardizes on the spec's canonical units
(overall x/100, dimensions x/5).

## Design reference

- `prototypes/results.html`, `prototypes/transcript.html`,
  `prototypes/weak-areas.html` (layout, copy, states; mockup wins on
  disagreement except where this spec explicitly retains shipped behavior)
- `prototypes/theme.css` (already ported; canonical variable names only,
  never hard-coded values)
- `docs/interview-coach-ui-specification.md` §§22-25, 28-29 (locked
  target; there is no `feedback.html` mockup, so §24 governs Feedback detail)

## In scope

- Rebuild `ResultsScreen` per `results.html` + §22: meta line, H1,
  hero (overall /100 + band chip), dimension rows with evidence text,
  strengths / improvements two-col, Review + Practice actions.
- Rebuild `TranscriptReviewScreen` per `transcript.html` + §25: turn list
  with role accent + timestamp, Back to results + Practice weak areas.
- Rebuild `FeedbackDetailScreen` per §24 (no mockup): dimension picker,
  `<Dimension> - <n> / 5 (overall <m> / 100)` heading, strengths,
  opportunities, example improvement.
- Rebuild `WeakAreasScreen` per `weak-areas.html` + §§28-29: one practice
  card per weak dimension (pill + title + why + Practice button), empty
  fallback.
- Keep every shipped behavior the mockups abbreviate: Results eval polling
  (in-progress / failed / stale states), transcript export, Results
  History + Start-new actions, Weak-areas single-focus fallback data.
- Rewrite the `styles.css` rules these screens use; remove their dead
  Stitch-era rules. Shared `ds/primitives` pieces they consume keep their
  APIs.
- Update the `render-smoke.test.tsx` cases for exactly these four screens
  to the new copy and markup. Tests follow the product.

## Out of scope

- Items 17d screens, item 18 (problem content; `ExecutionPanel` and
  `ProblemPanel` logic untouched), item 19, V2 work.
- Any change to `api/backend-client`, `voice/*`, `state/*` hooks,
  `dashboard.ts` / `progress.ts` / `history.ts` builders, backend APIs,
  or item 20 routing.
- `prototypes/` deletion (17d owns that); packages outside `web-client`.
- Browser tests (no `Browser tests` command declared).

## Build loop

One review packet at the end (`workflow.stepReview: "feature"`).
No checkpoint commits (`workflow.checkpointCommits: "disabled"`).
No `Verify` command is declared, so the gates are the project's real commands:
`pnpm typecheck` then `pnpm test` (live `*_test` DB when available, else the
suite's warn-and-pass path), plus `pnpm build` and the web-client build.

## Build steps

- [x] 1. Rebuild Results. Meta line + H1 per mockup (use the problem title
  when the snapshot exposes it; keep a neutral "Interview results" H1 if it
  does not - confirm against `SerializedStateSnapshot` while implementing);
  hero shows overall verbatim /100 with band chip; each dimension row shows
  score verbatim /5 plus its evidence/notes and selects that dimension into
  the Feedback flow on click; strengths / improvements two-col; keep the
  evaluation poll and its in-progress / failed / stale states byte-for-byte
  in behavior. Retire the `/10` conversion.
  Done when the Results render-smoke cases pass with new-copy assertions
  (`/100` hero, `/5` dimension rows) and clicking a dimension row selects it.
- [x] 2. Rebuild Feedback detail. Controlled `selected` dimension prop
  (replacing the internal default-first state); §24 layout with overall in
  the heading; strengths, opportunities, example improvement; empty state
  ("No structured feedback yet" + Back to Results) when evaluation or
  dimensions are absent. Wire `App.tsx` to hold the selected dimension:
  Results passes the clicked key, Feedback detail receives it, Back clears it.
  Done when the Feedback render-smoke case passes and selecting different
  Results rows lands on the matching dimension.
- [x] 3. Rebuild Transcript review. Turn list per mockup (role-accented
  cards, timestamps); keep Export transcript; add the mockup's Practice weak
  areas action (new `onWeakAreas` prop, `App.tsx` pushes `/weakareas` as
  Results already does); drop the always-empty "Marked moments" card (no
  producer exists; the mockup has no such section). Load turns from the
  server via the existing `backend.getTranscript` when live events are empty
  (History entries have no live events); live events remain the first source
  right after an interview.
  Done when the Transcript render-smoke case passes and a History entry with
  no live events renders its server transcript.
- [x] 4. Rebuild Weak areas. One card per weak dimension (lowest-first,
  cap 3) with pill (`<dimension> - <n>/5`), title, why-line from mastery /
  outcome / weakness-count / lowest-dimension reasons, and a Practice button;
  every Practice button calls the existing `onPractice` contract (`App.tsx`
  owns the target, unchanged), so buttons read "Practice", never
  "Practice: <problem>". Keep the current no-data fallback content.
  Done when the WeakAreas render-smoke case passes with per-card assertions.
- [x] 5. Shared styles + final gates. Confirm no 17c screen references
  removed Stitch classes; leave 17d screens' rules for their slice. Run
  `pnpm typecheck`, `pnpm test`, `pnpm build`, and the web-client build,
  all green in one clean run.
  Done when all four pass.

## Files / areas

- `packages/web-client/src/screens/ResultsScreen.tsx`,
  `packages/web-client/src/screens/TranscriptReviewScreen.tsx`,
  `packages/web-client/src/screens/FeedbackDetailScreen.tsx`,
  `packages/web-client/src/screens/WeakAreasScreen.tsx`
- `packages/web-client/src/App.tsx` (selected-dimension state, transcript
  `onWeakAreas` only; no other wiring changes)
- `packages/web-client/src/styles.css` (17c screens' rules only)
- `packages/web-client/tests/render-smoke.test.tsx` (17c cases only)
- Reference (read-only): `prototypes/results.html`,
  `prototypes/transcript.html`, `prototypes/weak-areas.html`,
  `prototypes/theme.css`, `docs/interview-coach-ui-specification.md` §§22-25, 28-29

## Data / contracts

- None. No schema, migration, API, or persisted-data change.
- Canonical units, rendered verbatim: overall `overallScore` 0-100 as
  `<n> / 100`; each dimension `score` 0-5 as `<n> / 5` (§23). The `/10`
  conversion is retired with the old screens.
- Screen props changes (only): `FeedbackDetailScreen` gains controlled
  `selected: string | null` (+ `onSelect`); `TranscriptReviewScreen` gains
  `backend: BackendClient` and `onWeakAreas`; Results `onFeedback` takes the
  dimension key. All other props, hook behavior, and backend call shapes
  unchanged.
- Transcript turns and evaluation strings are user/model-controlled text:
  render as plain text nodes only, never as HTML.

## Testing

- Existing Vitest render-smoke suite, updated per rebuilt screen; no new
  test files (no new logic ships - presentation rewrite over kept wiring,
  plus thin prop threading covered by the smoke cases).
- `pnpm typecheck` is the lint gate and must exit 0; full suite plus both
  builds must stay green.
- If a step surfaces logic the suite never covered, add a focused test
  per the testing gate instead of silently skipping it.

## Notes for the AI

- Keep the diff off `api/`, `voice/`, `state/`, builders, backend, and every
  17a/17b/17d screen or component.
- Copy comes from the mockups and spec doc, not memory; old assertions
  must be replaced for touched screens, never weakened to pass.
- Every evaluation state must stay reachable: loading, in-progress
  (polling), scored, failed, stale history entry, empty transcript,
  no-feedback, no-weak-data. Do not drop a state because the fixture
  cannot trigger it.
- The per-card Practice buttons intentionally share one target owned by
  `App.tsx`; do not invent a dimension-to-problem mapping (item 18 owns
  problem content).
- No em dashes in generated content; comment the why, not the what.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":8358,"specSha256":"ff52c7668ecf5176ab7fc9d547a9421598d817df7e9c9e800cfe10fc9bed8ce4","branch":"refs/heads/feature/feedback-screens","head":"120cf57c3a0cb35bc50e6adada64da4002efffbc","baseRef":"refs/heads/main","baseCommit":"120cf57c3a0cb35bc50e6adada64da4002efffbc","sourceTree":"bf5c5355b1d5c09798b01c2ff0241f4a4f657d3f","absentOptional":[]} -->
