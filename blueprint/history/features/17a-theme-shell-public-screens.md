# Feature: Theme, shell, public screens

**From build-plan:** feature 17a
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/fresh-web-client-ui-rebuild-17a`

## Goal

First slice of the item 17 client rebuild: port the approved prototype
theme into the app and rebuild the shell plus the public screens
(Landing, Sign-in, Create-account, Onboarding) from scratch on the
approved mockups. Props contracts and all backend wiring stay unchanged
so `App.tsx` routing keeps working; later slices (17b-17d) rebuild the
remaining screens on this foundation.

## Design reference

- `prototypes/theme.css` (single theme source; port, do not reinterpret)
- `prototypes/landing.html`, `prototypes/onboarding.html` (layout, copy,
  states: primary + auth/validation error variants)
- `docs/interview-coach-ui-specification.md` (_locked target; mockup wins
  on disagreement)
- Prototype skill rule: theme tokens port into the app in this first UI
  feature; `prototypes/` itself is deleted only at 17d's `/complete` so
  later slices keep their reference.

## In scope

- Replace `packages/web-client/src/tokens.css` with the prototype theme
  (warm-editorial minimal: ivory canvas, forest-green primary, terracotta
  danger, Newsreader/Inter/JetBrains Mono), keeping the `:root` +
  `color-scheme` structure the app expects.
- Rebuild `AppShell` (brand, nav links, guest account control) and the
  public screens `LandingScreen`, `SignInScreen`,
  `CreateAccountScreen`, `OnboardingScreen` (role/level/goals pre-auth
  capture, dev-mode bypass note) plus supporting `Marketing` and
  shared `ProfileForm` components. `ProfileForm` is shared with 17d's
  Profile screen: restyle it once here, 17d reuses it untouched.
- Rewrite the `styles.css` rules these screens use; dead Stitch rules for
  other screens stay until 17d removes the remnants.
- Update the `render-smoke.test.tsx` cases for exactly these screens
  (App landing, AppShell, SignIn, CreateAccount, Onboarding,
  ProfileForm) to the new copy and markup. Tests follow the product.

## Out of scope

- Items 17b-17d screens, item 18 (problem pane stays title-only),
  item 19, V2 work.
- Any change to `api/backend-client`, `voice/*`, `state/*` hooks,
  backend APIs, or screen props contracts (`App.tsx` wiring unchanged).
- Browser tests (no `Browser tests` command declared).

## Build loop

One review packet at the end (`workflow.stepReview: "feature"`).
No checkpoint commits (`workflow.checkpointCommits: "disabled"`).
No `Verify` command is declared, so the gates are the project's real commands:
`pnpm typecheck` then `pnpm test` (live `*_test` DB when available, else the
suite's warn-and-pass path), plus `pnpm build` and the web-client build.

## Build steps

- [x] 1. Port the theme. Replace `tokens.css` contents with the
  `prototypes/theme.css` values (same variable names), keep `:root` and
  `color-scheme: light`, wire the font stacks.
  Done when every token value matches the prototype file and
  `pnpm typecheck` passes.
- [x] 2. Rebuild AppShell. New brand/nav/guest-control markup on the
  prototype look; props contract unchanged.
  Done when the AppShell render-smoke case passes with new-copy
  assertions and no old-Stitch class names remain in the component.
- [x] 3. Rebuild Landing (+ Marketing). Public sales pitch per
  `landing.html`: hero, scoring proof, pillars, steps, closing CTA,
  footer; keep the sign-in/create-account entry points wired to the
  existing flow.
  Done when the App-landing render-smoke case passes and the screen
  renders its primary state without backend calls.
- [x] 4. Rebuild SignIn + CreateAccount. Same `backend-client` calls,
  same success/error/loading states, new look and validated labels.
  Done when both render-smoke cases pass, including one error-state
  assertion each.
- [x] 5. Rebuild Onboarding + ProfileForm. Same taxonomy options,
  same submit contract (role/level/goals, 500-char limit, blank absent),
  pre-auth local caching note, dev-mode bypass note.
  Done when both render-smoke cases pass, including the validation-error
  assertion.
- [x] 6. Styles scoping + final gates. Confirm no 17a screen references
  removed Stitch classes; leave other screens' rules for their slices.
  Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and the web-client
  build, all green in one clean run.
  Done when all four pass.

## Files / areas

- `packages/web-client/src/tokens.css` (theme port)
- `packages/web-client/src/styles.css` (17a screens' rules only)
- `packages/web-client/src/components/AppShell.tsx`,
  `packages/web-client/src/components/Marketing.tsx`,
  `packages/web-client/src/components/ProfileForm.tsx`
- `packages/web-client/src/screens/LandingScreen.tsx`,
  `packages/web-client/src/screens/SignInScreen.tsx`,
  `packages/web-client/src/screens/CreateAccountScreen.tsx`,
  `packages/web-client/src/screens/OnboardingScreen.tsx`
- `packages/web-client/tests/render-smoke.test.tsx` (17a cases only)
- Reference (read-only): `prototypes/landing.html`,
  `prototypes/onboarding.html`, `prototypes/theme.css`,
  `docs/interview-coach-ui-specification.md`

## Data / contracts

None. No schema, migration, API, or persisted-data change. Screen props
contracts and backend-client call shapes are unchanged.

## Testing

- Existing Vitest render-smoke suite, updated per rebuilt screen; no new
  test files (no new logic ships — pure presentation rewrite over kept
  wiring).
- `pnpm typecheck` is the lint gate and must exit 0; full suite plus both
  builds must stay green.
- If a step surfaces logic the suite never covered, add a focused test
  per the testing gate instead of silently skipping it.

## Notes for the AI

- Keep the diff off `api/`, `voice/`, `state/`, and every 17b-17d screen.
  If a shared style must change for a later screen, leave it for its slice.
- Copy comes from the mockups and spec doc, not memory; the suite's old
  Stitch-copy assertions must all be replaced for touched screens, never
  weakened to pass.
- Do not delete `prototypes/` (17d owns that); do not touch `packages/`
  outside `web-client`.

## Open questions

- None. Screen list follows the approved 17a split.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":6165,"specSha256":"1bff36afe379f54ddbc7bb2fb1a1ab77deb7eb622b909535972acfea6cea41ff","branch":"refs/heads/feature/fresh-web-client-ui-rebuild-17a","head":"38890c060cd35ae36333d7708fbdcb627cf85aff","baseRef":"refs/heads/main","baseCommit":"2241babbe66f21f8a7b13fb361a905d881f83519","sourceTree":"210cac37094633c7361d5033b5170807f7ee312c","absentOptional":[]} -->
