# Fix: Dimension accordion and results cleanup

**Type:** Fix
**Status:** verified
**Branch:** fix/dimension-accordion-and-results-cleanup

## The problem

Three defects on the evaluation results path, all confirmed in code:

1. Underscored dimension names. `ResultsScreen.tsx:163` renders the raw backend key (`{key}`) in the visible row name, so users see `testing_debugging`, `complexity_analysis`, `problem_understanding`. The `dimensionLabel` helper (`dimensions.ts`, spec §23 names) is already imported but used only in the row `aria-label`. The render-smoke test never caught it because its fixture only uses single-word keys.
2. Clicking a dimension navigates to a separate feedback screen that shows "No structured feedback yet." `ResultsScreen` polls `GET evaluation` into local state, but `FeedbackDetailScreen` receives only `finalSnapshot?.evaluation` (`App.tsx:740`): the snapshot taken at finish time, before the async evaluation completes. Worse, the separate screen is oversized for its content: only the title and coach notes vary per dimension; strengths/opportunities are evaluation-wide and already shown on results.
3. Results header shows "0 responses" though the candidate spoke. Both spots render `snapshot.responseCount`, which counts persisted `candidate_responses` rows — voice interviews only create those when the model calls `submit_interview_data`/`record_candidate_answer`. The count serves no purpose on this page and misleads.

## The fix

- Render `{dimensionLabel(key)}` as the visible row name in `ResultsScreen`. No change to keys, scores, notes, or aria.
- Turn the dimension list into a single-open accordion (FAQ-like): clicking a row expands its coach-notes detail inline; opening one collapses the others; clicking the open row collapses it. State is one `openKey: string | null` plus a tiny pure toggle helper with unit tests.
- One delegated click handler on the `.dim-list` container reads the row key from a `data-dim-key` attribute (via `closest`), so future dimensions need no code changes. No per-row closures. Rows stay real `<button>`s with `aria-expanded`/`aria-controls` for keyboard and screen-reader support.
- Delete the now-dead drill-in path: `FeedbackDetailScreen`, the `/feedback` route mapping, the `feedback` flow state in App, and the `onFeedback` prop. Typecheck plus test updates prove the removal is complete.
- Delete both header displays of the response count (page-meta line and hero hint). No fetch, no backend change, `responseCount` semantics untouched (it still feeds the conductor prompt).

Must not break: the evaluation poll, history/stale results path, weak-areas labels (already uses `dimensionLabel`), strengths/weaknesses cards on results.

## Build steps

- [x] Step 1: labels + single-open accordion with delegated handling.
  - Swap the raw key for `dimensionLabel(key)` in the row name; add `data-dim-key`, `aria-expanded`/`aria-controls`, the inline notes panel, `openKey` state, the pure toggle helper, and the single container `onClick`.
  - Visual affordance: a chevron in each row (rotates on open) plus an open-row accent style, so collapsed/expanded states are distinguishable at a glance.
  - Unit-test the toggle helper; extend the render-smoke results test with an underscored key (e.g. `testing_debugging`), asserting the raw key is absent and the human label renders (mind SSR HTML-escaping of `&`).
  - Done when: focused tests green, `pnpm typecheck` clean.
- [x] Step 2: delete the feedback drill-in path.
  - Remove `FeedbackDetailScreen`, `/feedback` mapping, App `feedback` flow + `feedbackDimension` state, and the `onFeedback` prop; update or drop the obsolete smoke tests.
  - Done when: typecheck clean, full `pnpm test` green; manual try (results -> click a row -> notes expand inline, one at a time; `/feedback` no longer routes).
- [x] Step 3: remove the response count from the header.
  - Delete the count from both header spots; assert its absence in the smoke test.
  - Done when: typecheck clean, full `pnpm test` green, web-client build ok; manual try shows no count anywhere on results.

## Verify

- Automated: typecheck + full test suite + Vite build (8GB heap flag as usual).
- Manual: results rows show human labels; click expands notes inline one at a time with keyboard support; no count anywhere on results.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4336,"specSha256":"ce0e0c386ed6f309ab34f5f2133a8ddd26c5bd3834ef2223a9d34fc35acaddf8","branch":"refs/heads/fix/dimension-accordion-and-results-cleanup","head":"4cf81c9915a74ba043afae2b909d422ecc77dbf8","baseRef":"refs/heads/main","baseCommit":"4cf81c9915a74ba043afae2b909d422ecc77dbf8","sourceTree":"e4db64394360170f2619e18dd014ffb73952ce01","absentOptional":[]} -->

## Completion

- Branch: fix/dimension-accordion-and-results-cleanup (head == base == main@4cf81c99 at archival).
- Changes: ResultsScreen single-open accordion (openKey + exported nextOpenDimension, one delegated onClick via data-dim-key, aria-expanded/controls, chevron + open-row accent CSS, dimensionLabel visible names, response-count displays removed); deleted FeedbackDetailScreen, /feedback route + flow, App feedback state/plumbing, onFeedback prop; .dim-list/.two-col 16px rhythm spacing.
- Tests: nextOpenDimension unit tests (open/switch/collapse); smoke fixture gains testing_debugging key asserting human label, raw-key absence in visible names, data-dim-key/aria-expanded/chevron presence, and no responses text; /feedback router expectation now asserts dashboard redirect; obsolete FeedbackDetail smoke tests removed.
- Gates: pnpm typecheck clean; full pnpm test 77 files/1245 green; web-client Vite build ok (8GB heap flag).
- Live evidence: user screenshots confirmed human labels, chevron affordance, and spacing fixes on the running dev server.
- Findings: F-01..F-04 fixed (P2/P3) stay in ledger; F-05 P2 + F-06/F-07 P3 open; no P0/P1. No independent review (client-only display work, non-sensitive).
- Known limitation (out of scope): refresh on /results or /transcript bounces to dashboard because canResults/canTranscript are in-memory only; queued as a follow-up fix.
