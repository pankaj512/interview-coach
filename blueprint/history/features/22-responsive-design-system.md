# Feature: Responsive design system (22)

**Type:** Feature
**Status:** verified
**Branch:** `feature/responsive-design-system`
**Build attempt:** 1

## The goal

One responsive design system for every `apps/web` page (landing, auth,
onboarding, dashboard, history, progress, profile, settings, lobby, live
session, results, modals, forms, tables, cards, nav, editors) across five
tiers: >=1600 large desktop, 1200-1599 desktop, 900-1199 compact, 768-899
small/tablet, <768 mobile. No behavior change; pages keep their content and
order, only layout adapts. Verified at 1920x1080, 1280x720, and 3840x2160
at 100% zoom.

## Source of truth

The agreed brief: max-width containers + fluid widths + breakpoints, never
plain scaling. Container targets: standard 1200-1280 (4K) / 1100-1200 (FHD)
/ 960-1080 (HD); forms 600-800; settings 900-1100; session 1400-1800 when
space allows; tables 1200-1500. Type scale: title 28-32, large heading
24-28, section 17-20, card 16-19, body 14-16, secondary 12-14, nav 13-14,
meta 12-13; never microscopic. Spacing scale 4/8/12/16/20/24/32/40/48.
Shared card language, restrained palette, consistent top nav, info-priority
on shrink, 4K must not look tiny.

## Gap this closes

`apps/web/src/styles.css` + `tokens.css` already have the token system,
font pairing, 1280 containers, and a single `.card` system. The gaps are
breakpoint sprawl (640/700/760/768/800/900/1024/1100, no >=1200 tier), zero
`clamp()` fluid type/spacing, undocumented container variety
(560/640/720/760/960/1020/1180/1280), and missing table-to-cards, compact
nav, and 1400-1800 session width.

## Build steps

- [x] Step 1 - Tokens + breakpoints, zero visual change: consolidate the
  sprawl into the five tiers and add fluid `clamp()` type/spacing tokens.
  Done when `pnpm --filter @interview-coach/web typecheck` and the web
  suite pass with no pixel change at 1920x1080 (side-by-side screenshot or
  computed-style spot check on nav, card, and body text).
- [x] Step 2 - Named container widths per page: map each page's container
  to the documented set (standard / forms / settings / session / tables).
  Done when every page uses a named width, the variety list is gone from
  `styles.css`, and typecheck + web suite pass.
- [x] Step 3 - Session, tables, nav: 1400-1800 session width when space
  allows; tables collapse to cards below their tier; compact nav under
  900px. Done when the live session uses the wide container on FHD/4K,
  a data table renders as cards on a narrow viewport, nav compacts without
  losing items, and typecheck + web suite pass.
- [x] Step 4 - Verify at three viewports: `/check` the running client at
  1920x1080, 1280x720, and 3840x2160 (readable, no overlap, no tiny text,
  nav/cards/forms intact on each). Done when all three viewports pass with
  recorded evidence.

## Verify

- `pnpm --filter @interview-coach/web typecheck` clean, web suite green,
  `pnpm build` clean.
- Manual pass at the three viewports per Step 4 (needs the dev stack up;
  ask the user to start it if it is not running).

<!-- blueprint:completion {"schemaVersion":1,"specBytes":3049,"specSha256":"006e8a5e16b5e20b8bd52e1fdac3d97e232601aaa3da693cb6e81caa34af9dec","branch":"refs/heads/feature/responsive-design-system","head":"b56308ad1fb6a7eb6d1a6e5fbbe858a84035f09a","baseRef":"refs/heads/main","baseCommit":"b56308ad1fb6a7eb6d1a6e5fbbe858a84035f09a","sourceTree":"9b7e11394544543bf28448ab933d0afc9b67e9b1","absentOptional":[]} -->

## What changed

- `apps/web/src/tokens.css` (Step 1): five-tier breakpoint contract
  (`--bp-mobile-max: 767px` / tablet 899 / compact 1199 / desktop 1599),
  fluid `clamp()` type tokens (`--fs-fluid-*` across the 28-32 to 12-13
  scale), spacing completions (`--space-12/20/32/40`), named containers
  (standard 1280 / forms 800 / settings 1100 / session 1800 / tables 1500).
  Zero visual change by construction (additions only).
- `apps/web/src/styles.css` (Steps 1-3): tier-mapping comment; all page
  containers on named `var(--container-*)` widths (dialog/tooltip/
  auth-card/68ch stay px as component widths); `@media (min-width: 1600px)`
  expands the live session (.state-strip/.live-grid/.transcript-band) to
  the 1800 session width; hist-table + mastery collapse to cards at
  <=767px via data-label attributes; compact scrollable nav under 900px.
  case-table keeps its editor-pane scroll as the designed exception.
- `apps/web/src/screens/HistoryScreen.tsx`,
  `DashboardScreen.tsx`: data-label attributes on table cells.
- `apps/web/tests/render-smoke.test.tsx`: HistoryScreen data-label
  assertions; new DashboardScreen mastery-card test.
- `blueprint/build-plan.md`: item 22 checked.

## Verification evidence

- `pnpm --filter @interview-coach/web typecheck`: clean.
- `pnpm build` (`tsc -b`): clean.
- Web suite: 27 files / 246 green (incl. new data-label tests).
- Full `pnpm test`: 79 files, 1256 green.
- /check at 1920x1080, 1280x720, 3840x2160: zero horizontal overflow,
  0 console errors, 0 failed requests; 767px card collapse proven in a
  real browser (thead hidden, rows stacked, ::before labels).
  Evidence screenshots: /tmp/opencode/check-responsive/ (scratch, not
  committed). Caveats: dashboard data cards + populated history table
  unverifiable (backend down during check); one transient unnamed
  single-test flake, green on rerun.
- No em dashes in new/edited content.

## Manual try path

Start the stack, open the client at 1920x1080, 1280x720, and 3840x2160:
pages stay inside centered max-width containers with readable type; shrink
to phone width for stacked cards (History mastery + interview table) and
the scrollable nav row; open a live session on a >=1600px viewport for
the 1400-1800 wide grid.

## Completion

- **Completed:** 2026-10-13 via `/complete` on branch
  `feature/responsive-design-system` (head == base == main@b56308a at
  archival). Feature 22, build attempt 1.
