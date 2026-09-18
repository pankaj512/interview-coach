# Fix: Dead auth entry flows (sign-in, sign-up, guest onboarding)

**Type:** Fix
**Status:** verified
**Branch:** `fix/dead-auth-entry-flows`

## The problem

No user can enter the app through the UI (proven in Chromium against a live backend, 2026-09-18):

1. **Sign in / Create account buttons are dead.** `App.tsx` sets `flow` to `"signin"`/`"signup"`, but the first-run gate (`session === null && !guestMode` → `LandingScreen`) runs before the standalone render block, and that block has no `flow === "signin"` / `flow === "signup"` branch. `<SignInScreen>` / `<CreateAccountScreen>` are imported but instantiated nowhere. The screens themselves are complete (login/register → `setAuthSession` → `onSuccess`); only the wiring is missing. `handleAuthSuccess` already exists and is unreferenced.
2. **Guest onboarding 401s.** Entering dev-guest mode does not re-run the placeholder-profile effect (deps `[session?.token, backend, profileNonce]` omit `guestMode`), so guests fall into the server-only `OnboardingScreen`, whose Save always `PUT /api/profile` → 401 with no session — despite copy claiming local caching.

## The fix

All in `packages/web-client/src/App.tsx` (~15 lines, no new files, no API/backend change):

- Exempt auth flows from the first-run gate so they reach the standalone block, and render the two screens there with the existing callbacks:
  - `flow === "signin"` → `<SignInScreen backend onSuccess={handleAuthSuccess} onGoCreate={() => goAuth("signup")}>`
  - `flow === "signup"` → `<CreateAccountScreen backend onSuccess={handleAuthSuccess} onGoSignIn={() => goAuth("signin")}>`
- Add `guestMode` to the placeholder-profile effect deps so entering guest mode installs the placeholder profile and lands on the dashboard; guests never see the server onboarding. `OnboardingScreen` stays server-only for signed-in users with no profile (its header contract, unchanged).

Must not break: signed-out landing, signed-in first-run onboarding (`PUT /api/profile` with session), guest dashboard (data hook stays disabled for guests), lobby/live/evaluating flows, existing render-smoke suite.

## Build steps

- [x] 1. Wire auth branches + guest effect dep in `App.tsx`. Gate exemption, both screen branches with the callbacks above, `guestMode` in effect deps — nothing else.
  Done when `pnpm typecheck` is green and the render-smoke suite passes unchanged.
- [x] 2. Prove the loop in a real browser (backend + seeded DB, no stubs except mic/voice gates as before): landing → Create account → new user → onboarding → dashboard; sign out → Sign in → dashboard; dev-guest → dashboard directly with no 401.
  Done when all three entry paths land where expected with no console errors beyond favicon/voice-503.

## Verify

- `pnpm typecheck`, `pnpm test` (warn-and-pass without a live `*_test` DB), `pnpm build` + web-client build.
- Browser pass above against `DATABASE_URL` on the throwaway docker DB; register via UI (password 8+ chars), confirm profile `PUT` 200 and dashboard recommendation renders.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3052,"specSha256":"2dfe0f0784cc8a0c9c23d83109a2d648df45e8564838e20874da6ade5376a1d9","branch":"refs/heads/fix/dead-auth-entry-flows","head":"8ab5f27c70b3a8f3723e0d1474b8c54ae41ac355","baseRef":"refs/heads/main","baseCommit":"8ab5f27c70b3a8f3723e0d1474b8c54ae41ac355","sourceTree":"5f179b9bf9494418292a6ac6529933e96d4792b4","absentOptional":[]} -->

## Completion record

Work branch `fix/dead-auth-entry-flows` (base `main@8ab5f27`). All changes in
`packages/web-client/src/App.tsx` (+12/-6); no new files, no API/backend change.

- Landing gate and profile-loading gate exempt `flow === "signin" | "signup"`.
- `LandingScreen` callbacks switched from `setFlow` to `goAuth` so `nav` is
  nulled and auth flows reach the standalone block (spec-implied wiring detail).
- `profile === null` gate exempts auth flows: signed-out users have no profile,
  so without this they fell into server onboarding instead of the auth screens
  (caught by the browser pass, fixed, re-proven).
- Nav-views block requires `profile !== null` for type narrowing; unreachable
  states fall through to the flow-driven standalone block.
- Standalone `signin`/`signup` branches render the existing screens with
  `handleAuthSuccess` + cross-links; `guestMode` added to the
  placeholder-profile effect deps.

Final gates (2026-09-18, this session): `pnpm typecheck` clean,
`pnpm test` 60 files / 466 passed, `pnpm build` (`tsc -b`) clean,
web-client `vite build` clean. Browser proof against live backend + seeded
throwaway DB: landing -> Create account -> register -> onboarding (profile PUT
200) -> dashboard with recommendation; sign out -> Sign in -> dashboard;
dev-guest -> dashboard shell with zero `/api/*` requests and zero console
errors/warnings; signin<->signup cross-links work. Known limitation (pre-existing,
out of scope): guest dashboard shows the permanent loader because the disabled
data hook has never had guest content.

No findings resolved by this fix; F-01..F-04 (P2/P3, feature-16 audit) stay open
verbatim in the ledger. No independent review requested or required (all regular
gates manual; fix is routing-only wiring with no trust-boundary change).
