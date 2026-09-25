# Fix: Interview room layout and results nav

**Type:** Fix
**Status:** verified
**Branch:** `fix/interview-room-layout-and-results-nav`
## The problem

The live interview room (`packages/web-client/src/screens/LiveScreen.tsx`)
has four layout issues (user screenshot 2026-09-25):

1. The Monaco editor (`.code-editor`, 320px) is vertically small for real
   coding.
2. The Mute/Pause/End voice rail (`.rail`) sits at the bottom, below the
   fold, while a second `state-strip` card repeats the paused state.
3. That duplicate "Interview paused" strip is redundant: the rail already
   carries pause state (`VoiceState paused` + the Pause/Resume toggle).
4. The Conversation transcript (`.transcript-list`) grows unbounded with no
   own scrollbar, so long turns push content away and the latest turn is not
   kept in view.
5. The evaluation (results) page renders standalone with no app navbar
   (`App.tsx` interview-ritual section), so from `/results` the user cannot
   reach dashboard, history, progress, profile, or settings without first
   going elsewhere. The drill-downs (feedback, transcript, weak areas) have
   Back buttons and are out of scope.

## Follow-up refinements (user review 2026-09-25, same branch)

6. The editor is fixed at 480px: it should start at 480px and grow with the
   code until the editor plus the "Test sample cases" row fill the viewport,
   then scroll internally.
7. The problem/editor boundary is fixed: it should be draggable (each pane
   keeps a minimum width; panes grow/shrink in opposition), while narrow
   screens keep the current stacked layout.
8. The hint + note text around "Test sample cases" (circled in the
   screenshot) reads as cramped/unstyled running text.

## The fix

- Move the `.rail` voice strip above the `.live-grid` (directly under the
  topbar) with its Mute/Pause/Resume/End controls and `VoiceState`/`Wave`
  wiring unchanged.
- Delete only the paused card from the `state-strip`; keep the reconnecting
  and mic-blocked alert cards. Paused state then shows in the one top strip.
- Raise `.code-editor` height from 320px to 480px (Monaco `automaticLayout`
  follows the container; no editor-option change).
- Give the transcript its own scroll region (`max-height` + `overflow-y:
  auto` on the list container) and auto-pin to the latest turn on new
  events (keep `aria-live="polite"`).
- Must not break: voice join/mute/pause/end wiring, the reconnecting and
  mic-blocked alerts, the Test submission path, the results drill-down
  callbacks (history/new/transcript/weak-areas/feedback), token-driven
  styling (`tokens.css`/`styles.css`, no one-off inline styles).
- Wrap the `flow === "results"` section in the existing `AppShell`
  (`active={null}`, same `onNavigate`/`onSignIn`/`onProfile`/`onSignOut`
  wiring as the dashboard shell) so the full primary nav is available on
  `/results`. Live, lobby, and evaluating keep their standalone chrome.

Follow-ups (same branch, items 6–8 above):

- Auto-grow the Monaco container from content height
  (`onDidContentSizeChange` + `getContentHeight`), clamped between 480px and
  a measured viewport cap (viewport height minus the editor's page offset
  minus the actions-row height), so the Test row stays in view; past the cap
  Monaco scrolls internally. Shrink back on delete, never below 480px.
- Add a drag handle between the two `.live-grid` panes driving a split
  percentage (CSS var, pointer + keyboard, min ~300px per pane, session
  state only); hide it under the existing 900px stacked layout.
- Restyle the Test row: button + hint aligned in one row, the "No Submit
  button" copy as a separated muted footnote. Token-driven, no inline
  styles.

## Build steps

- [x] 1. Rail to top + drop duplicate paused card — move the `.rail` block
  above `.live-grid`, remove the `live.paused` card from `state-strip`.
  Done when typecheck is green and paused/reconnecting/mic-blocked each
  still surface exactly once.
- [x] 2. Taller editor + scrollable pinned transcript — bump `.code-editor`
  to 480px, add the transcript scroll region with bottom-pinning on new
  turns. Done when typecheck is green, existing tests pass, and a live try
  shows the taller editor, internal transcript scroll, and the latest turn
  in view.
- [x] 3. Results page in app shell — wrap the results section in `AppShell`
  with `active={null}` and the existing nav callbacks. Done when typecheck
  is green and a live try shows the primary nav on `/results` with each
  link landing on its page.
- [x] 4. Auto-growing editor — grow the Monaco container with content from
  480px up to the measured viewport cap, then internal scroll. Done when
  typecheck is green, focused unit tests on the clamp helper pass, and a
  live try shows growth, the Test row staying in view, and the scrollbar
  past the cap. (Code + automated checks green 2026-09-25: typecheck clean,
  clampEditorHeight unit tests 3/3, vite build ok; live try pending user.)
- [x] 5. Draggable problem/editor split — drag handle between the panes with
  per-pane minimums, keyboard support, stacked layout kept on narrow
  screens. Done when typecheck is green, focused unit tests on the split
  clamp pass, and a live try shows drag/keyboard resize with minimums
  holding. (Code + automated checks green 2026-09-25: typecheck clean,
  clampSplitPct unit tests 2/2, render-smoke SSR passes with the divider;
  live try pending user.)
- [x] 6. Test-row copy styling — aligned button + hint row plus a separated
  muted footnote. Done when a live try shows the restyled row with no
  behavior change to the Test path. (Code green 2026-09-25; markup-only,
  Test path untouched; live try pending user.)

## Verify

- `pnpm typecheck` clean; full `pnpm test` green (68 files / 1130 tests,
  incl. 5 new clamp unit tests).
- Manual: rail on top with working Mute/Pause/End; paused shown in the rail
  only; transcript scrolls internally and follows new turns; editor taller;
  `/results` shows the app navbar and each link works.
- Manual (follow-ups, pending live try): type a long solution — the editor
  grows from 480px with the Test row staying in view, then scrolls
  internally; drag the pane divider both ways (300px floors hold), Tab to it
  and use ←/→; shrink below 900px — panes stack, divider hidden; Test row
  shows button + hint aligned with the footnote in a tinted strip.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":6387,"specSha256":"a1dd2b2800efd103cc6d9bbbb6103a0d5ee7ec7b01fc9380c82a10444dcaedeb","branch":"refs/heads/fix/interview-room-layout-and-results-nav","head":"b9239be1852f14ec57716873c974b3dd8d249007","baseRef":"refs/heads/main","baseCommit":"b9239be1852f14ec57716873c974b3dd8d249007","sourceTree":"d6e62fab051de2d8e17e54802442588de1600c5f","absentOptional":[]} -->
## Completion record

Work branch `fix/interview-room-layout-and-results-nav` (base `main@b9239be`, no prior archive at this path). Layout follow-ups for the interview room plus results nav, all on the unmerged verified work from steps 1-3:

- `packages/web-client/src/screens/LiveScreen.tsx`: rail moved above `.live-grid`; only the paused card removed from `state-strip` (reconnecting + mic-blocked kept); transcript pin effect (`scrollTop = scrollHeight` on new events); draggable split — grip divider (`role="separator"`, pointer drag with capture, window-level move/up, arrow keys at 2%/press, focus ring) driving `--editor-pct` (default 55%); pure `clampSplitPct` enforces the 300px-per-pane floor (`SPLIT_PANE_MIN`).
- `packages/web-client/src/styles.css`: `.live-grid` grid-to-flex (same rhythm; editor pane `flex: 0 1 var(--editor-pct, 55%)`, both panes `min-width: min(300px, 100%)`); divider grip styling; `.code-editor` fixed 480px height replaced by 480px min-height for auto-grow; test-row alignment (`.test-row`) and tinted footnote strip (`.test-note`); <=900px stacks and hides the divider as before.
- `packages/web-client/src/components/CodeWorkspace.tsx`: viewport-capped auto-grow — `onDidContentSizeChange` + window resize drive `fitEditorHeight` (cap = viewport height minus editor page offset minus actions-row height minus 32px room), pure `clampEditorHeight` between 480px and the cap; past the cap Monaco scrolls internally. Test submission path unchanged.
- `packages/web-client/src/App.tsx`: `flow === "results"` wrapped in the existing `AppShell` (`active={null}`, dashboard shell wiring) so the primary nav is available on `/results`.
- `packages/web-client/tests/code-workspace.test.ts`: 5 new pure unit tests (`clampEditorHeight` x3, `clampSplitPct` x2).

Final gates (this session, after all product changes): `pnpm typecheck` clean, full `pnpm test` 68 files / 1130 tests green, web-client `vite build` succeeds (needs `NODE_OPTIONS=--max-old-space-size=8192`); focused `code-workspace` + `render-smoke` 39/39 (divider SSR-covered). Manual live try of the follow-ups (editor growth + Test row pinned + internal scroll; drag/keyboard resize with floors; narrow stacking; restyled row) is documented in the spec Verify section and left to the user — automated gates are green and the Test path is behavior-unchanged.

No findings resolved by this fix; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; UI-only change, no new trust boundary).
