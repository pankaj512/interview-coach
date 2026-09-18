# Fix: Landing brand home, auth modal, CTA centering

**Type:** Fix
**Status:** verified
**Branch:** `fix/auth-nav-polish`

## The problem

Three small navigation/polish defects on the public entry flow (all confirmed
against the code, 2026-09-18):

1. **Brand is not a home button.** `MarketingTopbar`
   (`components/Marketing.tsx:22`) and the signed-in `AppShell`
   (`components/AppShell.tsx:37`) render `Interview Coach` as a plain
   non-interactive `<span>`. Users expect it to return home.
2. **No way back from sign-in / sign-up.** The bare auth forms looked
   unfinished and stranded: no product context, no return path. User decision
   (2026-09-18): auth becomes a modal over the landing page instead of
   standalone screens, so the marketing content is already behind the form
   and close/backdrop/Escape returns to landing. (An earlier side-panel
   approach was built, proven, then reverted in favor of this.)
3. **Bottom landing CTA is left-aligned.** `styles.css:423` reads
   `.landing-final .landing-shell .cta`, which never matches (the DOM nests
   the reverse), so `justify-content: center` never applies. The prototype
   (`prototypes/landing.html:126`) centers the buttons under the
   `Your next interview is already scheduled. By you.` heading.

Browser chrome back/forward stays out of scope; full URL routing follows as
its own feature spec.

## The fix

- `MarketingTopbar` gains an `onBrandClick` callback; the brand renders as a
  button invoking it. Landing passes a scroll-to-top handler (hero section
  carries `id="start"`). `AppShell` brand becomes a button returning to the
  dashboard via its existing `onNavigate`.
- Landing renders `SignInScreen` / `CreateAccountScreen` inside a modal
  dialog (`role="dialog"`, labelled, backdrop-click and Escape to close,
  autofocus first field, visible close button) when the auth flow is active
  while signed out. Cross-links switch forms inside the modal. Closing
  returns to the landing page underneath.
- Standalone auth branches stay as fallback for signed-in entry (e.g.
  Settings -> Sign in): both auth screens take an optional `onBack` rendered
  only when provided; the modal omits it (X closes), the fallback passes a
  return-to-dashboard handler. Accepted edge: Settings -> Sign in -> Back
  lands on the dashboard, not back in Settings.
- Correct the CSS selector to `.landing-final .cta`
  (`justify-content: center`), matching the prototype, plus minimal modal
  styles with existing tokens. No new files, no API/backend change.

Must not break: landing topbar/hero/final layout, signin<->signup
cross-links, `handleAuthSuccess` flow, guest entry, render-smoke suite.

## Build steps

- [x] 1. Brand buttons + CTA selector fix. `MarketingTopbar` prop,
  `AppShell` brand button, corrected `.landing-final .cta` - nothing else.
  Done when `pnpm typecheck` is green and the render-smoke suite passes unchanged.
- [x] 2. Landing auth modal + standalone fallback. Modal dialog in
  `LandingScreen` for signed-out auth flows; optional `onBack` on both auth
  screens used only by the signed-in fallback; minimal modal styles.
  Done when `pnpm typecheck` is green and the smoke suite (updated for modal
  open/close and optional back) passes.
- [x] 3. Browser proof (live backend, no stubs): modal opens from both
  landing buttons, closes via X/backdrop/Escape, cross-links switch forms in
  place, register-through-modal reaches onboarding then dashboard, signed-in
  AppShell brand returns to dashboard, bottom CTA stays centered.
  Done when all behaviors observed with no console errors beyond
  favicon/voice-503.

## Verify

- `pnpm typecheck`, `pnpm test`, `pnpm build` + web-client build.
- Browser pass above with screenshots showing the modal over landing and the
  centered CTA.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3787,"specSha256":"2432a2850924a647eda9bbccf8fd04aa8e70562b0e8d04eda3c71105988be55d","branch":"refs/heads/fix/auth-nav-polish","head":"0cd582adcc1ed9cb45ad285f5ade97f965ea65e3","baseRef":"refs/heads/main","baseCommit":"04b87dbf29185b69d254779f5ae8eea4ee3c13fd","sourceTree":"c5a140f3712374613600dd6255f756a29d0262b9","absentOptional":[]} -->

## Completion record

Work branch `fix/auth-nav-polish` (base `main@04b87db`). Product + test
changes only; no new files, no API/backend change.

- Landing brand and signed-in AppShell brand are buttons: landing scrolls to
  top, shell returns to the dashboard via existing `onNavigate`.
- Signed-out auth flows render `SignInScreen` / `CreateAccountScreen`
  inside a native modal dialog over the landing page (showModal guard,
  Escape/backdrop close, autofocus close control); cross-links switch forms
  in place, so no separate marketing content is needed.
- Standalone auth branches stay as signed-in/guest-Settings fallback; both
  auth screens take an optional `onBack` rendered only when provided.
- Bottom landing CTA selector corrected to `.landing-final .cta`
  (pixel-centered per browser proof), plus minimal token-based modal styles.
- An earlier marketing-side-panel approach was built, browser-proven, then
  fully reverted per user direction; no panel leftovers remain.
- Smoke suite updated for modal open/close and optional-Back cases.

Final gates (2026-09-18, this session): `pnpm typecheck` clean,
`pnpm test` 469 passed, `pnpm build` (`tsc -b`) clean, web-client
`vite build` clean. Browser proof on live backend: modal open/close via
X/Escape/backdrop, in-place signin<->signup switch, register-through-modal
to onboarding (profile PUT 200) to dashboard, guest Settings fallback with
Back to guest dashboard, both brand buttons, zero console errors.

No findings resolved by this fix; F-01..F-04 (P2/P3, feature-16 audit) stay
open verbatim in the ledger. No independent review requested or required
(all regular gates manual; auth-presentation UI with no credential or
session logic change).
