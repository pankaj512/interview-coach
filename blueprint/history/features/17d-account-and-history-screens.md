# Feature: Account and history screens

**From build-plan:** feature 17d
**Build attempt:** 1
**Branch:** `feature/account-and-history-screens`
**Status:** `verified` (review-feedback steps 5-16 built; final gates
rerun for /complete: typecheck 0, web-client 168, root 494 (62 files),
`tsc -b` clean; round-2/3 items verified live in the browser)

## Goal

Final slice of the item 17 client rebuild: rebuild History, Progress,
Settings, and Profile from scratch on the approved mockups. All state
logic, hooks, pagination, delete flow, profile save, voice wiring, and
backend calls stay unchanged; only markup and styles move to the
prototype look on the 17a theme. Scores standardize on the canonical
units (`overallScore` verbatim /100, dimension scores verbatim /5).
Delete the consumed `prototypes/` directory once nothing references it.

## Design reference

- `prototypes/history.html`, `prototypes/progress.html`,
  `prototypes/settings.html` (layout, copy, states; mockup wins on
  disagreement except where this spec explicitly retains shipped behavior)
- `prototypes/theme.css` (already ported; canonical variable names only,
  never hard-coded values)
- `docs/interview-coach-ui-specification.md` §§26-27, 30, 40 (locked
  target; there is no `profile.html` mockup, so Profile follows the
  current structure restyled, plus §30 Account linking)
- `blueprint/history/features/17c-feedback-screens.md` (sibling-slice
  precedent: keep shipped behavior the mockups abbreviate, drop controls
  with no producer or consumer)

## In scope

- Rebuild `HistoryScreen` per `history.html` + §26: H1 "Interview
  history", flat table (Session, Date, Score verbatim /100, Evaluation
  pill, Review action) replacing the date-grouped card list; keep search,
  difficulty select, evaluated/pending/failed quick filters, per-row
  Delete with `deletingId` busy states, Review select with `busyId`
  states, Load more pagination, Start new/practice actions, and both
  empty states (true-empty uses the mockup copy "No interviews to show
  yet" + `Start practice`; filtered-empty keeps its own line).
  Retire the `/10` score conversion.
- Rebuild `ProgressScreen` per `progress.html` + §27: H1 "Overall
  performance" + monotonic-mastery sub; keep the trend chart (required by
  §27 "Overall trend") but fix its scale to canonical /100 units (it
  currently clamps 0-100 scores onto a 0-10 axis, pinning every dot at
  the top); Curriculum progress hero % + module rows, Topic mastery rows
  with mastery pill + attempts, Strengths / Focus areas cards, Performance-by-type
  rows (§27 names interview-type performance; pure render of the existing builder
  output), Recommended practice action; keep the dashboard-data error state with
  Retry and all loading/empty fallbacks. The old Areas-to-improve dimension bars
  are retired: dimension detail lives on the 17c Results / Feedback / Weak areas
  screens (confirmed `buildProgress` dimensions are evaluation 0-5 scores, so no
  rescaling question remains).
- Rebuild `SettingsScreen` per `settings.html` + §30: Account card
  (display name, email, role/level, Edit profile, sign in/out/create),
  Privacy card (transcript-retention note + working Export JSON
  download); keep the history refresh action with an honest label.
  Remove the General / Voice / Interview / AI cards: every control in
  them (`ic.settings` theme, language, notifications, defaults, speaker
  test, provider labels) is write-only localStorage with zero readers
  outside this screen, and neither the mockup nor §30 includes them.
  No bulk "Clear history" button: no backend contract for it exists
  (only single `deleteInterview`, kept in History), and a destructive
  cascade delete is not a UI-slice addition.
- Rebuild `ProfileScreen` (no mockup): keep the exact save flow
  (`backend.putProfile`, busy/error, remount-on-save) and `ProfileForm`
  contract; keep the Back affordance.
  (As-built: no markup change required — the screen already uses theme
  classes and the untouched save flow; verified by the unchanged
  Profile/ProfileForm smoke cases.)
- Wire `App.tsx` only: new optional `onEditProfile` prop on Settings
  (routes to the existing profile flow, same target the shell avatar
  uses); no other wiring changes.
- Rewrite the `styles.css` rules these four screens use; remove their
  dead Stitch-era rules. Shared `ds/primitives` pieces they consume keep
  their APIs.
- Update the `render-smoke.test.tsx` cases for exactly these four
  screens to the new copy and markup. Tests follow the product.
- Delete `prototypes/` (all 17 slices are now ported) after confirming
  no source file imports or references it.

## Out of scope

- Item 18 (problem content; `ExecutionPanel` and `ProblemPanel` logic
  untouched), item 19, V2 work.
- Any change to `api/backend-client`, `voice/*`, `state/*` hooks,
  `dashboard.ts` / `progress.ts` / `history.ts` builders (except the
  Progress trend-scale fix, which is presentation math over kept data),
  backend APIs, or item 20 routing (URLs unchanged).
- New backend endpoints (bulk history clear, retention setting); packages
  outside `web-client`.
- Browser tests (no `Browser tests` command declared).

## Build loop

One review packet at the end (`workflow.stepReview: "feature"`).
No checkpoint commits (`workflow.checkpointCommits: "disabled"`).
No `Verify` command is declared, so the gates are the project's real commands:
`pnpm typecheck` then `pnpm test` (live `*_test` DB when available, else the
suite's warn-and-pass path), plus `pnpm build` and the web-client build.

## Build steps

- [x] 1. Rebuild History. Flat table per mockup (Session, Date, Score
  verbatim `<n> / 100`, Evaluation pill, Review link-action); keep
  search + difficulty + quick filters, per-row Delete busy states,
  Review busy states, Load more, both empty states with the mockup copy
  for true-empty. Retire the `/10` conversion and the grouped card
  markup. HistoryEntry exposes no problem/topic/verdict fields, so the
  mockup's Problem/Topic columns map to the entry's session info
  (interview type + status), never invented data.
  Done when the History render-smoke cases pass with `/100` assertions
  and delete/load-more behavior unchanged.
- [x] 2. Rebuild Progress. Cards per mockup (curriculum hero % + module
  rows, mastery pills + attempts, strengths/focus items, Recommended practice);
  trend chart rescaled to /100 with its grid labels; keep the error +
  Retry state and every loading/empty fallback.
  Done when the Progress render-smoke case passes and a 0-100 trend no
  longer clamps to the chart ceiling.
- [x] 3. Rebuild Settings + Profile. (Account-card profile coupling
  reverted by step 7 — see there.) Settings per mockup + §30 (Account
  kv card with Edit profile + auth actions; Privacy card with retention
  note + working Export; honest history-refresh label); remove the
  dead-preference cards; Profile restyled with identical save behavior;
  `App.tsx` threads `onEditProfile` to the existing profile flow.
  Done when the Settings and Profile render-smoke cases pass and profile
  save still round-trips through `putProfile`.
- [x] 4. Delete `prototypes/`, shared styles + final gates. Confirm no
  17d screen references removed Stitch classes and no source file
  references `prototypes/` before deleting it. Run `pnpm typecheck`,
  `pnpm test`, `pnpm build`, and the web-client build, all green in one
  clean run.
  Done when all four pass and `prototypes/` is gone.
- [x] 5. Progress action-first layout (review feedback). Remove the
  `RecommendationHero` banner from Progress: the Dashboard owns the
  recommendation CTA ("Start recommended" / "New suggestion"), and the
  banner pushes meaningful data below the fold. Keep a compact action row
  directly under the lede: primary "Recommended practice" (existing
  `onStartRecommendation` + `starting`/`data.busy` gating). "Practice weak
  areas" stays contextual in the Focus card (existing `onWeakAreas`). Shrink the trend chart
  to a compact strip (height ~120, gridlines 0/50/100) and move it below
  the Curriculum / Topic-mastery columns, so actions + curriculum %
  + mastery render without scrolling. Keep the error + Retry state and
  every loading/empty fallback.
  Done when the Progress smoke case asserts the action row renders and
  "Start recommended" no longer appears on Progress, with the suite green.
- [x] 6. Settings Voice card with a working interviewer-voice control
  (review feedback). Add `src/voice/voice-prefs.ts`: the closed Azure
  realtime voice set (alloy, ash, ballad, coral, echo, sage, shimmer,
  verse, marin, cedar — mirroring the backend `AZURE_VOICE_VOICE`
  comment), `loadVoicePreference` (localStorage `ic.voice`, validated
  against the set, `null` when absent/invalid), `saveVoicePreference`.
  Thread it through `buildSessionUpdate(session, voiceOverride?)` so a
  stored preference replaces `session.voice`, and have
  `VoiceInterviewClient.connect` pass `loadVoicePreference() ?? undefined`
  (server mint stays the default; invalid stored values can never reach
  the wire). Settings gains a Voice card: "Interviewer voice" dropdown
  (Server default + the 10 voices) that saves on change, with a hint that
  it applies to voice interviews. No speaker test and no provider labels:
  there is no real preview path without Azure credentials. No mic-device
  picker: no device enumeration or selection plumbing exists, and that is
  new machinery, not a settings slice.
  Done when new unit tests cover pref validation (valid/unknown/empty)
  and the session-update override + fallback, and a Settings smoke case
  asserts the voice dropdown renders.
- [x] 7. Profile gets its own navigation; Settings stops mixing the two
  (review feedback). Add `"profile"` to `NavKey` + the shell `NAV`
  (order: Dashboard, History, Progress, Profile, Settings); `navigate`
  routes it to the existing `goAuth("profile")` flow, and the profile
  flow renders `AppShell active="profile"`. Guard `goAuth`: a `"profile"`
  target with no session falls back to `"signin"` (covers guests for both
  the tab and the existing avatar path; the router already redirects a
  signed-out `/profile` deep link to `/`). Revert the step-3 coupling:
  `AccountSection` loses the `profile` / `onEditProfile` props (Account
  is identity + sign in/out only) and `App.tsx` drops the threading.
  No Profile screen content change: the form already owns the user-context
  fields. `pathForSnapshot(null, "profile", …)` already returns
  `/profile`, so the URL mirror keeps working with no router change.
   Done when the AppShell smoke case sees the Profile tab, Settings no
   longer mentions Edit profile, and the suite + gates stay green.
- [x] 8. History CTA above the fold (round-2 feedback). Move "Start new
  interview" into a `page-head` row beside the title/lede; drop the
  bottom-of-table CTA (the empty state keeps its own "Start practice").
  Done when the History smoke case asserts the header CTA renders.
- [x] 9. Progress two-dimensional layout (round-2 feedback). CTA moves
  into the `page-head` ("Recommended practice", same gating); new
  `.prog-grid` (7fr/5fr, collapse at 640px): left = Overall trend +
  Curriculum progress, right = Strengths + Focus areas (+ weak-areas
  action) + Topic mastery; Performance by type + Recurring weaknesses
  share a bottom `.cols`. Done when the Progress smoke case asserts the
  CTA, trend, and grid, verified live at desktop width.
- [x] 10. Profile Discard + heading de-dupe (round-2 feedback). Drop the
  `SectionHead` "Profile" lede (the nav tab already labels the page;
  keep a visually-hidden h1); `ProfileForm` gains a "Discard changes"
  ghost button shown when dirty and not busy, resetting all fields to
  `initial`. Done when the Profile smoke case asserts the lede is gone
  and Discard round-trips live (appears on edit, resets on click).
- [x] 11. Visible active-nav indicator (round-2 feedback). The
  `shell-nav-active` + `aria-current` wiring already existed; restyle
  from subtle underline to a filled `primary-soft` pill. Done when the
  AppShell smoke case asserts the active class and the pill is confirmed
  in a desktop screenshot.
- [x] 12. Progress alignment pass (round-3 feedback). The curriculum hero
  now uses the real `hero-number` / `hero-den` display classes (64px
  numeral) instead of body-size text, and every card `.section-title`
  gets bottom margin so the first list divider no longer reads as a
  title underline. Done when the Progress smoke case asserts
  `hero-number` and a desktop screenshot shows the numeral + spacing.
- [x] 13. Voice dropdown shows the real default (round-3 feedback). New
  `DEFAULT_VOICE = "alloy"` in `voice-prefs.ts` mirrors the backend
  `AZURE_VOICE_VOICE` fallback; the dropdown lists only the 10 real
  voices and initializes to the stored preference ?? `DEFAULT_VOICE`.
  No "Server default" option, no server mention in the hint ("Applies
  to voice interviews."). Done when the Settings smoke case asserts the
  dropdown renders with no "Server default" and unit tests pin the
  default into the closed set.
- [x] 14. De-server the Settings + History copy (round-3 feedback).
  "Refresh from server" becomes "Reload interviews"; the Privacy hint
  becomes account-language with no server mention; the export-failure
  message drops "safe on the server"; the History lede drops
  "Server-kept record ... backend". Done when the Settings smoke case
  asserts "Reload interviews" and no "server" string renders.
  Out of scope (not 17d screens): LobbyScreen still says "server" in two
  voice-readiness error strings — flagged, untouched.
- [x] 15. List-divider + weakness-row consistency (round-3 follow-up).
  `.trow` dividers now sit between rows only (`.trow + .trow`), so no
  opening divider under the card title and none missing at the end —
  the same rule `.item` already used. Recurring weaknesses drops the
  one-off `plain-list` for the shared `.item` + warn-tick rows Focus
  areas uses, keeping the verbatim "· {n}×" counts. The right-aligned
  monospace stat column is intentional tabular figures, unchanged. Done
  when the suite stays green and a desktop screenshot shows dividers
  strictly between rows.
- [x] 16. Dashboard card spacing (round-3 follow-up; narrow 17b
  exception, CSS only, no tsx touched). The Dashboard `.wrap` container
  is a plain block and `.card` carries no vertical margin, so stacked
  cards sat nearly touching. `.wrap` is now a flex column with a 24px
  gap — the same token as the side-by-side `.cols` gutters, so vertical
  and horizontal rhythm match; the intro line's legacy bottom margin is
  neutralized inside `.wrap` to avoid doubling. Done when the smoke
  suite stays green and a desktop screenshot shows even card separation.

## Files / areas

- `packages/web-client/src/screens/HistoryScreen.tsx`,
  `packages/web-client/src/screens/ProgressScreen.tsx`,
  `packages/web-client/src/screens/SettingsScreen.tsx`,
  (`ProfileScreen.tsx` untouched — no markup change required, see step 3)
- `packages/web-client/src/App.tsx` (Profile-tab routing + signin fallback only; step-3 threading reverted)
- `packages/web-client/src/styles.css` (17d screens' rules only)
- `packages/web-client/tests/render-smoke.test.tsx` (17d cases only)
- `packages/web-client/src/components/AppShell.tsx` (`NavKey` + Profile tab)
- `packages/web-client/src/components/AccountSection.tsx` (decouple profile)
- `packages/web-client/src/voice/voice-prefs.ts` (new), `voice/session.ts`,
  `voice/voice-client.ts` (voice-preference override only)
- `packages/web-client/tests/voice-prefs.test.ts` (new)
- `prototypes/` (deleted in step 4)
- Reference (read-only): `prototypes/history.html`,
  `prototypes/progress.html`, `prototypes/settings.html`,
  `prototypes/theme.css`, `docs/interview-coach-ui-specification.md`
  §§26-27, 30, 40

## Data / contracts

- None. No schema, migration, API, or persisted-data change.
- Canonical units, rendered verbatim: overall `overallScore` 0-100 as
  `<n> / 100`; dimension scores 0-5 as `<n> / 5` (§23, 17c precedent).
  The `/10` conversion is retired with the old screens, including the
  trend-chart axis.
- Screen props changes (only): `SettingsScreen` keeps its step-1 props
  (the step-3 `onEditProfile` threading was reverted in step 7).
  All other props, hook behavior, and backend call shapes unchanged.
- History rows and transcript-adjacent strings are user/model-controlled
  text: render as plain text nodes only, never as HTML.
- Destructive actions stay per-entry (`deleteInterview` in History);
  Settings performs no deletion.
- Step 5-7 contracts: interviewer-voice preference persists in
  localStorage under `ic.voice` (validated against the closed Azure set;
  never sent to the backend — it overrides `session.voice` in the
  client-built `session.update` only, server mint stays the default).
  `NavKey` gains `"profile"`; no router, schema, or API change.

## Testing

- Existing Vitest render-smoke suite, updated per rebuilt screen; no new
  test files (no new logic ships - presentation rewrite over kept wiring,
  plus thin prop threading covered by the smoke cases).
- `pnpm typecheck` is the lint gate and must exit 0; full suite plus both
  builds must stay green.
- If a step surfaces logic the suite never covered, add a focused test
  per the testing gate instead of silently skipping it.
- Steps 5-7 ship new logic, so they ship new tests: `voice-prefs.test.ts`
  (validation) plus session-update override/fallback cases and smoke
  assertions for the Progress action row and the Voice dropdown.

## Notes for the AI

- Keep the diff off `api/`, `state/`, builders (trend-scale
  math excepted), backend, item 20 routing, and every 17a/17b/17c screen.
  Steps 5-7 narrowly except: `voice/session.ts` + `voice/voice-client.ts`
  (preference override at the existing session.update call site only) and
  `AppShell.tsx`/`App.tsx` navigation (Profile tab only).
- Copy comes from the mockups and spec doc, not memory; old assertions
  must be replaced for touched screens, never weakened to pass.
- Every state must stay reachable: history loading / empty / filtered /
  deleting / busy / paginating; progress error / loading / empty mastery;
  settings signed-in / signed-out; profile save busy / error.
- Do not invent problem, topic, or verdict data for History rows: render
  only what `HistoryEntry` carries.
- No em dashes in generated content; comment the why, not the what.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":18535,"specSha256":"0730a09e9de8e7a2eb735d75292ada084b644a01d07fe71a52c9347134c69687","branch":"refs/heads/feature/account-and-history-screens","head":"2b4392e3e83203b8b8e9ec9677134db5d1706f1e","baseRef":"refs/heads/main","baseCommit":"2b4392e3e83203b8b8e9ec9677134db5d1706f1e","sourceTree":"ce6e94c12725cc99b50184b35a21939aab2e8399","absentOptional":[]} -->
