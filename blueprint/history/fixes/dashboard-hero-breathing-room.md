# Fix: Dashboard hero breathing room

**Type:** Fix
**Status:** verified
**Branch:** fix/dashboard-hero-breathing-room

## The problem

On the dashboard, air sits in the wrong place. A large empty band stretches
between the navbar and the "Good afternoon" greeting, while the green
recommendation card below packs its content tightly: tags, title, two text
lines, and two buttons with little separation.

Two causes, both in `packages/web-client/src/styles.css`:

1. Doubled top padding on the dashboard path. `DashboardScreen` renders a
   `.wrap` (padding-top `var(--space-xl)`, 48px) inside the shell content area
   (`.shell-content`, also 48px top). The stack reads as ~96px of dead space.
2. Cramped card internals. `.rec` uses 24px vertical padding, `.rec h2` has
   8px vertical margins, and `.rec .cta` sits 16px below the text.

## The fix

CSS-only, in `styles.css`. Move air from above the greeting into the card so
total page height stays roughly flat:

- Open up `.rec`: vertical padding 24px to 32px (no token exists between
  `--space-lg` and `--space-xl`; raw px matches existing usage like
  `padding: 8px 0`), `.rec h2` vertical margins 8px to 16px, `.rec .cta`
  top margin 16px to 24px.
- Trim the doubled top padding on the dashboard path only (confirm the
  `.wrap`-inside-shell nesting first; reduce one of the two 48px tops, e.g.
  the dashboard `.wrap` top to `--space-lg`). Never touch `.shell-content`
  globally; other pages keep their spacing.
- Check the narrow breakpoint rules for `.rec`/`.wrap` so mobile does not
  regress. No new tokens, no markup changes; if markup turns out necessary,
  revise this spec instead of improvising.

Must not break: spacing on other shell pages, mobile layout, the `.rec`
gradient/button treatments.

## Build steps

- [x] Step 1: card breathing room plus top-air trim.
  - Apply the `.rec`/`.rec h2`/`.rec .cta` spacing above and the
    dashboard-only top-padding trim.
  - Done when: typecheck clean, full `pnpm test` green, web-client build ok,
    and a desktop-width screenshot shows a roomier card with the greeting
    sitting higher (plus a narrow-width screenshot with no overflow).

## Verify

- Automated: typecheck + full test suite + Vite build (8GB heap flag as usual).
- Manual: dashboard screenshot before/after at desktop and narrow widths.
  No unit tests: pure styling is exempt under the scope rule; evidence is
  screenshot plus build.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2426,"specSha256":"ef737f731473d3f3222df78c06589c7aa841ae751312f0cebcca32dfc67844bf","branch":"refs/heads/fix/dashboard-hero-breathing-room","head":"cba9ec01664a82b50d8a8a25ceb7a4d2d91a559e","baseRef":"refs/heads/main","baseCommit":"cba9ec01664a82b50d8a8a25ceb7a4d2d91a559e","sourceTree":"d9deb91482fccb2b1c3cba1d30b629af1e1092c1","absentOptional":[]} -->

## Completion

- Branch: fix/dashboard-hero-breathing-room (head == base == main@cba9ec0 at archival).
- Changes (all in packages/web-client/src/styles.css, no markup): new .shell-content > .wrap rule halving the doubled 48px top padding above the greeting (.wrap is dashboard-only app-wide); .rec vertical padding 24px to 32px; .rec h2 vertical margins 8px to 16px; .rec .cta top margin 16px to 24px.
- Gates: pnpm typecheck clean; full pnpm test 77 files/1245 green; web-client Vite build ok (8GB heap flag).
- Live evidence: user-confirmed desktop screenshot of the running dev server (greeting higher, card contents separated). Narrow-width screenshot outstanding; assessed safe by construction (zero horizontal changes, no .rec/.wrap breakpoint overrides).
- Findings: F-01..F-04 fixed (P2/P3) stay in ledger; F-05 P2 + F-06/F-07 P3 open; no P0/P1. No independent review (CSS-only display work, non-sensitive).
