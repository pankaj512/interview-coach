# Fix: live-room split panes scroll per part instead of per side

**Type:** Fix
**Status:** verified
**Branch:** `fix/live-split-single-scroll`

## The problem

On the interview screen the divider between the problem (left) and the editor
(right) narrows each side while dragging, and inner parts start scrolling
individually: judge-code `pre` blocks and the samples table on the left,
Monaco / `textarea.code` on the right, plus the transcript list's own capped
scroll. Wanted: content wraps first, and past the pane minimum one scrollbar
serves the whole side, with no per-part scrollbars.

Agreed scope (user call): single-scroll per side, except Monaco keeps its
internal scroll (it cannot push scrolling to the parent without unbounded
growth). Its horizontal inner scrollbar still goes away via word wrap.

## The fix

Pure client layout change (`LiveScreen.tsx`, `CodeWorkspace.tsx`,
`styles.css`); drag mechanics, `clampSplitPct`, the 300px floor, and the
stacked mobile layout stay untouched:

- Left side: `.live-column` becomes the single scroll container (`min-width: 0`
  down the chain, side-level horizontal scroll). Problem `pre` blocks and
  samples-table cells lose their individual horizontal scroll (scoped under
  `.live-grid` so legacy panels are unaffected); prose and table cells wrap
  (`overflow-wrap`, precedent: `.case-table` already does this). Transcript
  loses its 420px cap and the auto-scroll effect (`LiveScreen.tsx:183-186`)
  retargets to the side container; `aria-live` stays.
- Right side: Monaco gets `wordWrap: "on"` so narrowing wraps code instead of
  opening its horizontal scrollbar; `textarea.code` and result blocks lose
  individual `overflow-x` in favor of the side container. Monaco keeps its
  vertical internal scroll through the existing viewport-capped auto-grow
  (`fitEditorHeight`, Test row stays in view).

Must not break: divider drag/keyboard, editor auto-grow and Test/Run paths,
voice transcript updates, starter code shown verbatim, global `pre` styling
outside the live room.

## Build steps

- [x] Step 1 - Left side single scroll: column-level scroll container,
  wrapping problem content and table, uncapped transcript with retargeted
  auto-scroll. Done when narrowing the divider wraps statement text and table
  cells with no inner scrollbar, and past the floor one scrollbar serves the
  whole left side.
- [x] Step 2 - Right side single scroll: Monaco word wrap plus side-level
  scroll for inner blocks, editor vertical scroll unchanged. Done when
  narrowing wraps code with no horizontal editor scrollbar, and wide result
  content scrolls the side, not the block.

## Verify

- Drag the divider both ways in a live room: content wraps first, then exactly
  one scrollbar per side appears; no per-part scrollbars except Monaco's
  vertical one; transcript still follows new turns.
- `pnpm --filter @interview-coach/web typecheck` clean, focused tests green,
  existing `render-smoke` pane tests unchanged.

<!-- blueprint:completion {"schemaVersion":1,"specBytes":2981,"specSha256":"c21e4305b6a4852aa91750113bcee278817a5954be1c9317f56d689dfada7edc","branch":"refs/heads/fix/live-split-single-scroll","head":"aa97a0712a7d6373b9a6f219831b1bd23748bc0d","baseRef":"refs/heads/main","baseCommit":"aa97a0712a7d6373b9a6f219831b1bd23748bc0d","sourceTree":"4097ec841bef0eee912068af11493b0c9ae1335c","absentOptional":[]} -->

## What changed

- `apps/web/src/styles.css`: `.live-column` and the editor `.card` are the
  side scroll containers (`overflow-x: auto`); live-room `pre` wraps
  (`pre-wrap` + `overflow-wrap`, own `overflow-x` removed); samples table
  uses `table-layout: fixed` with wrapping cells; transcript 420px cap
  removed; verdict `.event-log` uncapped. All scoped under `.live-grid`;
  cards get `min-width: 0` so panes shrink.
- `apps/web/src/screens/LiveScreen.tsx`: new pure `shouldFollowTranscript`
  helper; transcript effect follows new turns through the page only when the
  reader is already near the bottom.
- `apps/web/src/components/CodeWorkspace.tsx`: Monaco `wordWrap: "on"`;
  vertical scroll, auto-grow, and Test/Run paths unchanged.
- `apps/web/tests/code-workspace.test.ts`: 3 new `shouldFollowTranscript`
  tests (at-bottom follows, at-top leaves alone, threshold boundary).

## Verification evidence

- `pnpm --filter @interview-coach/web typecheck`: clean.
- `pnpm build` (`tsc -b`): clean.
- Focused: `code-workspace.test.ts` + `render-smoke.test.tsx` +
  `problem-statement.test.ts`, 76/76 green (render-smoke pane tests
  unchanged).
- Full `pnpm test`: 79 files, 1252 tests green.
- No em dashes in new/edited content.
- Wrap-first / one-scrollbar-per-side done-whens need a live drag check
  (`verification.uiEvidence` is `when-available`); manual path below.

## Manual try path

Start the stack (`docker compose up -d db backend web`), open a live room,
drag the divider both ways: statement text, judge code, and table cells wrap
first, then exactly one scrollbar serves each side; only Monaco keeps an inner
vertical scrollbar; transcript follows new turns only when already at the
bottom.

## Completion

- **Completed:** 2026-10-12 via `/complete` on branch
  `fix/live-split-single-scroll` (head == base == main@aa97a07 at archival).
- **Deviations from spec:** `textarea.code` is not used in the live room
  (only ProfileForm), so there was nothing to change there; the transcript
  auto-scroll uses sticky page-follow instead of retargeting to the side
  container, because the column has no vertical overflow and a retarget would
  be a dead no-op.
