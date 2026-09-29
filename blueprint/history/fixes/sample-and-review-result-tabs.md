# Fix: Sample and review result tabs

**Type:** Fix
**Status:** verified

## Revision 4 (user feedback: icon inside the button, multi-line tooltip)

The `(i)` icons sit outside the buttons and the hover text renders as one long single line (native `title`). Fix: move each icon inside its button label and replace the native title with a wrapping CSS tooltip (`data-tip` + `::after`, `max-width` cap, normal white-space). Position/color scheme unchanged.

## Revision 3 (user feedback: drop the tabs)

## Revision 2 (user feedback on the verified draft)

## Revision (user feedback on the verified draft)

Two problems in the draft: the tab row plus the shared button row is too many buttons, and the shared "Runs your code against the sample test case." hint sits next to Submit, misdescribing it. Fix: drop the shared action row — each panel owns its action. Sample panel holds [Test sample cases] + "Runs your code against the sample test case in the isolated sandbox." (or the no-sample text; disabled when `sample === null`). Review panel holds [Submit for Review] + "Asks the AI judge for a correctness and optimality verdict and saves your code as a submission." The bottom `test-note` is removed (its content now lives in the two hints). The shared error renders at the top of the active panel. Busy labels, auto-switch, `onActivity` strings unchanged.
**Branch:** `fix/sample-and-review-result-tabs`

## The problem

After Test/Submit, the room shows `error 0/0 in 709ms`-style one-liners that say nothing about what actually happened: no per-sample row (input, expected, actual, pass/failed), no pass counts, and the verdict renders as an undifferentiated stack of notes (screenshot 2026-09-29). The button still says "Submit for AI verdict"; the user wants "Submit for Review". The hint/note copy under the buttons is also stale ("persists nothing" — fix B persists a submission row).

## The fix

Client-only rework of the results area in `packages/web-client/src/components/CodeWorkspace.tsx`: a small two-tab tablist under the buttons — "Sample tests" and "Review" — each owning its result panel. No backend change; every field needed is already in `SerializedRun` / `SerializedSubmitVerdict` plus the client-side `sample`.

- **Sample tab:** one row per executed case — sample input (`sample.args`), expected (`sample.expected`), actual (`result.actual`), pass/failed badge, error text when present. Header counts passes plainly ("2 passed · 1 failed of 3 in 709ms"). An `error`-status run with zero results renders an explicit "could not execute — no case results" state, never `0/0`. Pairing: match `run.results` to the sample by name, falling back to the single result (Test always sends exactly `[sample]`).
- **Review tab:** same verdict content, restyled into labeled sections (Verdict + notes, Optimality + notes, Break-points, Edge cases, Summary). Button renamed to "Submit for Review" (busy: "Submitting…"); `onActivity` strings unchanged.
- **Copy:** test-note corrected (Submit persists the code as a submission row; only the verdict is ephemeral). Stale header comments updated.
- Tabs are plain buttons with tab semantics; switching never refetches. Empty panels explain what to do ("Run the sample cases…", "Submit for review…"). Error banner behavior unchanged.

Must not break: Test/Submit request flow, verdict push into the live session (`pushVerdictSummary`), starter prefill, editor behavior, transcript pinning.

## Build steps

- [x] 1. Sample-tests tab: pairing helper + per-case rows + counts header + error-state, with unit tests.
  Done when a run with mixed pass/fail renders one row per case with input/expected/actual/badge, an empty error run renders the no-execution state, and the new helper tests pass.
- [x] 2. Review tab: sectioned verdict card + "Submit for Review" rename + corrected note copy, with unit tests for any new pure helper.
  Done when the verdict renders in labeled sections, the button reads "Submit for Review", and typecheck + full suite + web build pass.
- [x] 3. Per-panel actions: remove the shared button row; each tab panel owns its action + hint, shared error moves into the active panel.
- [x] 4. Info affordances: each panel action gets an `(i)` icon whose hover text explains what its button does; "Test sample cases" shortens to "Test".
- [x] 6. Icon-in-button tooltips: each `(i)` moves inside its button; hover/focus shows a wrapping multi-line tooltip.
  Done when both buttons contain their icon, tooltips wrap within a capped width, and typecheck + focused tests + web build pass.
- [x] 5. Stacked results: remove the tablist; one action row holds [Test] (i) [Submit for Review] (i); below it a "Sample tests" section then an "AI review" section, each with its empty / result states. Table, sectioned verdict, hints-as-tooltips, `onActivity` strings carry over unchanged.
  Done when two buttons + two headed sections render, tab state/CSS are gone, and typecheck + focused tests + web build pass.
  Done when each panel shows its button + hover icon (hints move into the hover text), the sample button reads "Test", and typecheck + focused tests + web build pass.
  Done when one tab row + one contextual action render, each hint describes its own button, and typecheck + focused tests + web build pass.

## Verify

- `pnpm typecheck`, `pnpm test` (full suite green), web-client build.
- Manual live try: C++ run with a passing and a failing sample shows both rows with actuals; Submit shows the sectioned review; tabs switch without refetching.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":5550,"specSha256":"88178ff445c9d7db936f474fd5bbc05dd27ba5c90823e0ebcc5af50942348c15","branch":"refs/heads/fix/sample-and-review-result-tabs","head":"ee696869e8aa2de25549184ba574dc8927a39d9a","baseRef":"refs/heads/main","baseCommit":"ee696869e8aa2de25549184ba574dc8927a39d9a","sourceTree":"b9f1ff0d663f35c0ac7ab21089419e9713e7c6aa","absentOptional":[]} -->

## Completion record

Client-only rework of the interview-room results area (CodeWorkspace.tsx + styles.css + code-workspace.test.ts), landed via revisions 1-6: per-case sample table (input/expected/actual/pass-fail) fed by pure sampleResultRows()/formatCaseValue(); sectioned AI-review card; stacked Sample-tests then AI-review sections under a single [Test (i)] [Submit for Review (i)] row; per-button wrapping tooltips; corrected Submit copy.

Gates: pnpm typecheck clean; focused code-workspace suite 30/30; full pnpm test 77 files/1230 green; 8GB web-client build ok. Live user try of the final stacked layout pending at merge time.

Findings ledger untouched (F-01..F-04 fixed P2/P3 retained; F-05 P2 + F-06/F-07 P3 open; no P0/P1). No independent review requested (non-sensitive client UI).
