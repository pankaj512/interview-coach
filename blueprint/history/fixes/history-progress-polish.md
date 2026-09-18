# Fix: History row and redundant bottom buttons polish

**Type:** Fix
**Status:** verified
**Branch:** `fix/history-progress-polish`

## The problem

Signed-in visual audit of History, Progress, and Dashboard (2026-09-18)
found the same small-UI-debt family as the Profile work. Dashboard is
clean. Four defects, all confirmed in code and screenshots:

1. **Floating dash in History rows.** Unevaluated entries render a bare
   "—" in the score slot (`HistoryScreen.tsx:135`), reading as broken
   layout mid-row.
2. **Duration wraps.** "30 min" breaks across two lines inside its chip
   (`HistoryScreen.tsx:140`, plain `.hint` span with no nowrap).
3. **Bottom "Back" on History** (`HistoryScreen.tsx:179`) duplicates the
   nav tabs, the same pattern removed from Profile per user direction.
   The adjacent "Start new interview" primary stays.
4. **Lone "Start new interview" at the bottom of Progress**, duplicating
   the in-card "Start recommended" / "Practice weak areas" CTAs.
5. Copy nit: "1 sessions" should pluralize ("HistoryScreen" meta,
   `SectionHead` `meta={`${filtered.length} sessions`}`).

## The fix

- Render the score slot only when `overallScore` is defined; no
  placeholder dash for unevaluated entries.
- `white-space: nowrap` on the duration hint (scoped rule reusing tokens,
  no new values).
- Remove the History bottom "Back" button, keeping "Start new interview".
- Remove the Progress bottom "Start new interview" button; the in-card
  CTAs already cover entry to practice.
- Pluralize the History meta (`1 session` / `N sessions`).

Must not break: row click/keyboard select, Review/Delete actions,
Load-more path, filters, Progress CTAs, render-smoke suite, router tests.

## Build steps

- [x] 1. Row + button + copy fixes with smoke-case updates for the
  changed copy and removed buttons.
  Done when `pnpm typecheck` is green and the full suite passes.
- [x] 2. Browser proof (live backend, signed in): History row shows no
  floating dash with duration on one line; no Back row; Progress has no
  bottom button; "1 session" meta correct.
  Done when screenshots confirm each with no console errors beyond favicon.

- [x] 3. Card-consistency round. (a) Dashboard: when strengths, focus
  areas, and recent are all empty, render one consolidated starter card
  with warmer copy instead of three sparse hint boxes; data states keep
  the current layout. (b) Progress: reuse the dashboard dark-hero
  recommendation treatment via a shared component both screens render
  (dashboard output unchanged). (c) History rows: responsive fallback
  collapsing the fixed-pixel grid on narrow screens with the action
  buttons in a horizontal row.
  Done when typecheck + full suite pass and screenshots of all three
  match the app's layout language with no console errors.

## Verify
- Browser pass above with screenshots of History and Progress.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2878,"specSha256":"c7f9a3b9a8daf98b36f67e6bd917580019f66f92d6e3b583f9a8906ef8c4f50f","branch":"refs/heads/fix/history-progress-polish","head":"cef37cb0088e9e82aec860f988c844fbe6e9ed02","baseRef":"refs/heads/main","baseCommit":"cef37cb0088e9e82aec860f988c844fbe6e9ed02","sourceTree":"3db2aa93b3f6bcbe864cb900e9b1a0a3edb22f1c","absentOptional":[]} -->

## Completion record

Work branch `fix/history-progress-polish` (base `main@cef37cb`). History
now leaves unevaluated score slots empty, keeps duration metadata on one
line, pluralizes the session count, and removes the redundant Back action.
Progress removes its duplicate bottom start action.

Dashboard renders one first-interview starter card when all three insight
sections are empty. Dashboard and Progress share `RecommendationHero` for
the dark recommendation treatment. History actions use a content-sized,
horizontal action area to avoid overlap on narrow layouts.

Final gates (2026-09-18, this session): `pnpm typecheck` clean, `pnpm test`
482 passed, `pnpm build` (`tsc -b`) clean, and the web-client Vite build
clean. Browser proof on live services covered Dashboard, History (including
narrow layout), and Progress with no console warnings after reload.

No findings resolved by this fix; F-01..F-04 (P2/P3, feature-16 audit) stay
open verbatim in the ledger. No independent review requested or required
(all regular gates manual; presentational UI changes only).
