# Fix: Profile opens as a full page, not an auth-style card

**Type:** Fix
**Status:** verified
**Branch:** `fix/profile-full-page`

## The problem

Profile (`flow === "profile"`, URL `/profile`, opened from the account menu
and the dashboard "Edit goal" CTA) renders inside the standalone `<main>`
in the narrow centered `auth-wrap` / `auth-card` treatment, so it looks like
a modal dialog. Settings renders as a full page (shell chrome + section
cards). Users expect Profile to open the same way. Second, any fields in
Settings that actually edit the user profile belong on the Profile page.

## The fix

- Render `ProfileScreen` inside the `AppShell` full-page chrome (header,
  nav, account menu) like every other nav view, instead of the standalone
  auth card. Keep the `flow`-based routing and `/profile` URL mechanics
  unchanged: no new `NavKey`, no route-table change, no new tab (shell
  renders with no tab highlighted).
- Restyle the screen body to the Settings section layout (page header +
  section cards reusing Settings' existing classes/primitives): identity
  header, inline editor, no bottom button row. The editor is always live on
  the page: `ProfileForm` gains additive `hideSubmitUntilDirty` and
  `className` props (onboarding defaults unchanged), the screen remounts it
  on each save so dirty tracking restarts, and saves stay on the page via a
  navigation-free profile update (onboarding keeps `handleProfileSaved`).
- Audit `SettingsScreen` sections for fields that edit the user profile
  (role, level, goals, interview types). Move any found onto the Profile
  page; leave device and app preferences (theme, language, voice, difficulty
  defaults, retention) in Settings. Current evidence suggests Settings holds
  none besides account identity, in which case this step is verify-only.
- Keep the `ProfileScreen` prop contract (`backend`, `identity`, `profile`,
  `onSaved`, `onBack` to dashboard, `onSettings`, `onSignOut`) and the
  onboarding gate untouched.

Must not break: account-menu Profile entry, dashboard "Edit goal" CTA,
`/profile` deep link + Back/Forward, onboarding (still standalone),
render-smoke suite, router unit tests.

## Build steps

- [x] 1. Profile as an AppShell full page + Settings audit for profile
  fields (moved if any, else verify-only). Restyle with existing
  Settings classes; update render-smoke cases to the new layout.
  Done when `pnpm typecheck` is green and the full suite passes.
- [x] 2. Browser proof (live backend, no stubs): account menu -> Profile
  renders full-page in shell chrome at `/profile` (no auth-card look);
  edit role/level saves (PUT 200) and reflects on dashboard; Back/Forward
  across `/profile`; Settings shows no profile fields.
  Done when all behaviors observed with no console errors beyond favicon.

- [x] 3. Visual alignment polish. Account identity left-stacked (the
  `setting-row` space-between pushes it right), back action folded into the
  actions row, page flow left-aligned like Dashboard/Settings.
  Done when a screenshot of `/profile` matches the other pages' layout
  language with no console errors.

## Verify

- `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Browser pass above with a screenshot of the full-page Profile.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3244,"specSha256":"e6207b7db3faa7d55670b721388cb02704fa0b5942be02594f6f8908fd6412c3","branch":"refs/heads/fix/profile-full-page","head":"6e9083c5e5e712116b41d4c5f30f0ab975b15345","baseRef":"refs/heads/main","baseCommit":"6e9083c5e5e712116b41d4c5f30f0ab975b15345","sourceTree":"83b2a214d22ee1e48d938ab36576444f4b775901","absentOptional":[]} -->

## Completion record

Work branch `fix/profile-full-page` (base `main@6e9083c`). ProfileScreen
moves from the standalone auth-card into the AppShell full-page chrome, then
to inline editing per user review:

- Screen restyle to SectionHead + FormCard sections (Account identity,
  Interview profile); auth-wrap/auth-card removed (verify-only Settings
  audit: no profile fields to move).
- `flow === "profile"` renders in an early return inside AppShell
  (active null, no new tab/route); old standalone branch deleted.
- Inline editing: ProfileForm gains additive hideSubmitUntilDirty +
  className props (onboarding defaults unchanged); screen remounts the form
  on each save; saves stay on-page via a navigation-free profile update
  (onboarding keeps handleProfileSaved). Bottom button row removed.
- profile-facts restyled to Settings-style label/value rows (space-between,
  hairline dividers, dd margin reset); new .profile-identity flex rule.

Final gates (2026-09-18, this session): pnpm typecheck clean, pnpm test
482 passed, pnpm build clean. Browser proof on live services: full-page
/profile in shell, edit level -> Save appears -> PUT 200 -> stays on page,
Save dismissed, dashboard reflects; Back/Forward across /profile; Settings
has no profile fields; zero console errors/warnings. One long-lived-Vite
stale transform observed twice during proofs (resolved by reload/touch).

No findings resolved by this fix; F-01..F-04 (P2/P3, feature-16 audit) stay
open verbatim in the ledger. No independent review requested or required
(all regular gates manual; presentational change, no credential logic).
