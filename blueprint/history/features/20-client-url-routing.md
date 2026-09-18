# Feature: Client URL routing

**From build-plan:** feature 20
**Build attempt:** 1
**Branch:** `feature/client-url-routing`
**Status:** verified

## Goal

Give the web client real History-API URLs so browser back/forward, refresh,
and deep links work: every nav view and auth/ritual state maps to a path,
unrestorable states fall back to a sane landing, and the landing in-page
anchors keep working. No router dependency; the existing `nav`/`flow` state
in `App.tsx` stays the source of truth with the URL synced to it.

## In scope

- Route table (contract; `?` marks replace-instead-of-push transitions):

  | URL | Signed out | Signed in |
  | `/` | landing | dashboard (existing default view) |
  | `/signin`, `/signup` | landing + auth modal open | redirect `/dashboard` (replace) |
  | `/dashboard`, `/history`, `/progress`, `/settings` | redirect `/` (replace) | render nav view |
  | `/profile` | redirect `/` (replace) | profile screen (existing no-profile onboarding gate still applies) |
  | `/lobby`, `/live`, `/evaluating`, `/results`, `/feedback`, `/transcript`, `/weakareas` | redirect `/` (replace) | render iff the required in-memory state (interview/session plan/snapshot) is present, else redirect `/dashboard` (replace) |
  | unknown path | redirect `/` (replace) | redirect `/dashboard` (replace) |

- `pushState` on user navigations (nav clicks, brand, auth open/cross-links,
  back affordance, Start-practice entries); `replaceState` on automatic
  transitions (evaluating auto-advance, auth success) so Back skips them.
- `popstate` maps the URL back onto `nav`/`flow` (leaving `/signin|/signup`
  closes the modal); initial load hydrates `nav`/`flow` from the URL through
  the same fallback table.
- Hash-only changes are ignored by the router so `#how`/`#scoring`/`#why`
  keep scrolling natively; scroll to top on pushed/popped routes.
- When a gate overrides the hydrated state (e.g. signed-out deep link to
  `/dashboard` renders landing), replace the URL to match what renders.
- Guest mode is not encoded in the URL; refresh loses it and lands on
  signed-out landing (documented, matches today's dev-preview semantics).
- No onboarding URL: the existing signed-in-no-profile gate keeps rendering
  onboarding over any authenticated route.

## Out of scope

- Router dependency (hand-rolled History sync per proportional engineering).
- Route-level code splitting, saved scroll positions, guest persistence.
- Items 17c/17d/18/19; backend or API changes.

## Build loop

One review packet at the end (`workflow.stepReview: "feature"`).
No checkpoint commits (`workflow.checkpointCommits: "disabled"`).

## Build steps

- [x] 1. Route table + history hook + App wiring. Pure `url<->state`
  mapping beside usage (`state/use-client-router.ts`), `push` on user
  navigations, `replace` on automatic transitions, `popstate` handling,
  initial hydration, hash passthrough.
  Done when `pnpm typecheck` is green and new mapping unit tests pass.
- [x] 2. Fallback and gate interplay. Unrestorable-state redirects, gate
  URL normalization, modal open/close URL sync, scroll-to-top behavior.
  Done when `pnpm typecheck` is green and the full suite passes unchanged
  except the new tests.
- [x] 3. Browser proof (live backend, no stubs): back/forward across
  landing/auth-modal/dashboard/history; refresh on dashboard stays;
  refresh on live redirects to dashboard; signed-out deep link to
  `/dashboard` lands on landing with URL normalized; `#scoring` anchor
  still scrolls; zero console errors beyond favicon/voice-503.
  Done when all behaviors observed with screenshots.

## Files / areas

- `packages/web-client/src/state/use-client-router.ts` (new: pure mapping + hook)
- `packages/web-client/src/App.tsx` (wire push/replace/pop/hydrate into existing transitions)
- `packages/web-client/tests/` (mapping unit tests; render-smoke unchanged)

## Data / contracts

- The route table above is the contract; mapping functions are total
  (every path maps, unknown paths hit the fallback row).
- No persisted data, no API contracts, no new env. nginx and Vite dev
  already fall back to `index.html`, so deep links resolve in both.

## Testing

- Vitest unit tests for the URL`<->`state mapping (valid, unknown, and
  unrestorable-state cases). Logic gate applies: runner configured.
- Render-smoke suite must pass unchanged (default state renders identically).
- Step 3 browser proof per above; UI-only steps ride on screenshot evidence.

## Notes for the AI

- Keep the diff off `api/`, `voice/`, screens, and styles except where the
  router must touch `App.tsx` transitions.
- Do not break the auth modal open/close contract or the first-run/profile gates.
- Do not add `react-router` or any dependency to satisfy this spec.

## Open questions

- None blocking. The fallback redirects above are recorded defaults; flag in
  review if any should differ.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4888,"specSha256":"01d6d0d927ba04288ec4a21bbb29840139a2db946a99679023f07c85e9f28e3f","branch":"refs/heads/feature/client-url-routing","head":"992c1cf043db3b6d6e302c1c8b949a0a6fa35fde","baseRef":"refs/heads/main","baseCommit":"992c1cf043db3b6d6e302c1c8b949a0a6fa35fde","sourceTree":"f15f6e6e46fdb1b9ca083ce258a1c833bf502231","absentOptional":[]} -->

## Completion record

Work branch `feature/client-url-routing` (base `main@992c1cf`). Product
changes: new `packages/web-client/src/state/use-client-router.ts` (total
path<->state mapping, guarded push/replace with scroll-top), App.tsx wiring
(hydration initializers, push on user navigations, replace on automatic
transitions, gate-normalization + popstate effects above all early returns),
new `packages/web-client/tests/client-router.test.ts` (13 mapping tests).
No new dependency, no backend/API change.

Final gates (2026-09-18, this session): `pnpm typecheck` clean,
`pnpm test` 482 passed, `pnpm build` (`tsc -b`) + web-client vite build
clean. Browser proof against live backend + seeded throwaway DB: modal open
pushes /signin, Back closes to /, Forward reopens; cross-link pushes /signup;
register-through-modal replaces to /dashboard with onboarding over it;
History push + Back/Forward; refresh on /dashboard stays; refresh on /live
redirects to /dashboard; signed-out /dashboard deep link lands on landing with
URL /; #scoring scrolls natively; zero console errors/warnings + screenshot.

Build plan item 20 checked. No findings resolved by this feature; F-01..F-04
(P2/P3, feature-16 audit) stay open verbatim in the ledger. No independent
review requested or required (all regular gates manual; navigation-only change
with no trust-boundary impact).
