# Fix: Guest entry lands on a blank page

**Type:** Fix
**Status:** verified
**Branch:** `fix/guest-blank-page`

## The problem

Clicking "Continue without signing in (dev)" renders an empty `<main>` and
sticks there: no dashboard, no error, no failed request. This is a feature-20
regression. Hydration at `/` while signed out now initializes `nav: null`
(`initialSnapshot` in `state/use-client-router.ts`, via the `resolvePath`
`/` branch returning `{ nav: null, flow: null }`); pre-20 the initial nav
was always `"dashboard"`. But `onDevGuest` (`App.tsx`, first-run gate) only
calls `setGuestMode(true)` and never restores a nav target. The guest passes
every gate with the placeholder profile ready, fails the `nav !== null`
check with `flow` also null, and falls into the standalone block where no
branch matches. The URL-sync effect cannot repair it either:
`pathForSnapshot(null, null, true)` returns null. Silent blank page, which
is why render-smoke and the feature-20 browser proof missed it.

## The fix

Entering guest mode lands on the dashboard: alongside `setGuestMode(true)`,
set `flow: null` and `nav: "dashboard"`. The existing normalize effect then
repairs the URL to `/dashboard`. This mirrors the guest sign-out path
(`handleSignOut`), which already navigates to `"dashboard"`. One-line-class
change in the `onDevGuest` callback; no router-table, gate, or hook change.

Must not break: signed-out landing + auth modal routes, guest sign-out back
to landing, guest dashboard (loader stub, no 401s), render-smoke suite,
router unit tests.

## Build steps

- [x] 1. Land guest entry on the dashboard with URL repair, then re-prove
  the whole signed-out dev flow in a real browser (live backend, no stubs):
  dev-guest -> dashboard shell at `/dashboard` with zero `/api/*` calls;
  sign-out -> landing; modal open/close still works.
  Done when `pnpm typecheck` is green, the full suite passes, and the
  browser pass shows the dashboard shell with no console errors beyond
  favicon.

## Verify

- `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Browser pass above, including a screenshot of the guest dashboard shell.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2137,"specSha256":"42b1080588dff4b689bd3a51c312ef44db4b799801986a84a400d6a10d1c7135","branch":"refs/heads/fix/guest-blank-page","head":"8dcb234ac2db346d34754115bf2cc5900acc1087","baseRef":"refs/heads/main","baseCommit":"8dcb234ac2db346d34754115bf2cc5900acc1087","sourceTree":"cbac8fa1c196feb1d379b5a26d7ed85ea5327e4f","absentOptional":[]} -->

## Completion record

Work branch `fix/guest-blank-page` (base `main@8dcb234`). One change in
`packages/web-client/src/App.tsx` (+5/-1): `onDevGuest` now sets
`flow: null` and `nav: "dashboard"` alongside `setGuestMode(true)`;
the existing normalize effect repairs the URL to `/dashboard`. Mirrors the
guest sign-out path. No router, gate, or hook change.

Feature-20 regression root cause: hydration at `/` while signed out
initializes `nav: null` (pre-20 initial nav was always `"dashboard"`),
so guests passed every gate with the placeholder profile ready, failed the
`nav !== null` check with `flow` null, and fell into the standalone block
where no branch matches. Silent blank page; missed because render-smoke
never mounts the guest entry and the feature-20 proof predated the check.

Final gates (2026-09-18, this session): `pnpm typecheck` clean,
`pnpm test` 482 passed, `pnpm build` (`tsc -b`) clean. Browser proof on
live services: dev-guest -> dashboard shell at `/dashboard`, zero
`/api/*` calls, zero console errors/warnings; modal open at `/signin`
-> X closes to `/`; modal register -> onboarding -> dashboard with
recommendation; account-menu Sign out -> landing at `/`.

Known gap (pre-existing, out of scope): guests have no in-UI exit affordance
(AccountMenu shows only Sign in for guests), so the handleSignOut guest
branch is unreachable; a guest leaves by clearing storage.

No findings resolved by this fix; F-01..F-04 (P2/P3, feature-16 audit) stay
open verbatim in the ledger. No independent review requested or required
(all regular gates manual; one-line nav-state fix, no credential logic).
