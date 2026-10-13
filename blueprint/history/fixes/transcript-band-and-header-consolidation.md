# Fix: Transcript band and header consolidation

**Type:** Fix
**Status:** verified
**Branch:** `fix/transcript-band-and-header-consolidation`

## The problem

The live room shows two strips that each carry an `End interview` button
(`.live-topbar` and the `.rail` voice strip), and the conversation transcript
sits at the bottom of the problem pane showing only the last 6 turns. The
user wants one header and the transcript promoted to a full-width band above
the panes.

## The fix

- **One sticky header, two rows.** Merge `.live-topbar` and the `.rail` voice
  strip into a single sticky header container: row 1 keeps brand, title,
  `Timer`, status chip, and the completing badge plus the single `End
  interview` button; row 2 keeps `VoiceState`, `Wave`, and Mute/Pause (with
  the pause-unavailable hint). The rail's duplicate `End interview` goes
  away. `VoiceRail` keeps rendering the voice controls; only its placement
  and the extra button change.
- **Transcript band above the panes.** Remove the Conversation card from
  `.live-column`. Add a full-width band directly above `.live-grid` (same
  1280px container width as the grid) showing the full turn history with a
  fixed height and its own inner scrollbar. This is a deliberate,
  user-approved exception to the single-scroll-per-side direction: the band
  is a scrolling strip by design, everything else keeps scrolling per side.
- **Follow retarget.** The sticky-follow effect moves from the left column to
  the band element, reusing the same pure `shouldFollowTranscript` predicate
  against the band's scroll metrics. Existing unit tests stay valid.

Out of scope: single-scroll behavior everywhere else, the divider, the
renderer, seed data, and the `<=900px` stacked layout (band stacks above the
panes there like everything else).

## Build steps

- [x] Step 1 - Header consolidation: single sticky header container with
  one row (brand, title, VoiceRail state + wave + Mute/Pause flexing the
  middle, Timer, status) and one right-aligned `End interview` button. The
  status chip renders only for connecting/reconnecting/failed/micBlocked;
  terminal/steady states (connected/closed/idle) are hidden as internal
  plumbing. Done when the room shows exactly one `End interview` button,
  Mute/Pause still work, the chip appears only in interim states, and the
  header still sticks.
- [x] Step 2 - Transcript band: full-width fixed-height scrolling band above
  the grid with full history; transcript card gone from the problem pane;
  follow retargeted to the band. Done when the band shows all turns with its
  own scrollbar, the problem pane holds only the problem card, new turns
  still follow only when near the band bottom, and no other pane gains an
  inner scrollbar.

## Verify

- `pnpm --filter @interview-coach/web typecheck` clean, focused tests green,
  full `pnpm test` green.
- Live room: one header (two rows), transcript band on top with inner
  scroll, panes unchanged below.

<!-- blueprint:completion {"schemaVersion":1,"specBytes":2976,"specSha256":"8886a5afb8a2eb0871e7edcbb2867c6511f7ec97e3dbd81e833a07c76983f819","branch":"refs/heads/fix/transcript-band-and-header-consolidation","head":"2df80a17d4349d1b6acb5b153972ebb6c211dd62","baseRef":"refs/heads/main","baseCommit":"2df80a17d4349d1b6acb5b153972ebb6c211dd62","sourceTree":"7bb9db32eb81895063a83b3acf3c8f77a42ec623","absentOptional":[]} -->

## What changed

- `apps/web/src/screens/LiveScreen.tsx`: single sticky one-row header
  (brand, title, VoiceRail state + wave + Mute/Pause flexing the middle,
  Timer, status chip, one right-aligned `End interview` button); the
  duplicate rail `End interview` button and the `div.rail` block are gone.
  Status chip renders only for connecting/reconnecting/failed/micBlocked;
  connected/closed/idle hidden as internal plumbing. Conversation card
  removed from the problem pane; new `section.transcript-band` (aria-label)
  with fixed-height inner scroller holds the full-history transcript;
  follow effect retargeted to `bandRef` via the same pure
  `shouldFollowTranscript` predicate.
- `apps/web/src/styles.css`: header is a nowrap one-row flex; VoiceRail
  chrome stripped inside the header with middle flex; `.rail` rule deleted;
  new `.transcript-band` / `.transcript-band-scroll` (148px, own scroll)
  rules. The band inner scroll is the user-approved exception to
  single-scroll.
- No test-file changes needed: existing smoke/helper suites cover the
  touched paths.

## Verification evidence

- `pnpm --filter @interview-coach/web typecheck`: clean.
- `pnpm build` (`tsc -b`): clean.
- Focused: `render-smoke.test.tsx` + `code-workspace.test.ts`, 73/73
  green (29/29 smoke after the one-row + chip edits).
- Full `pnpm test`: 79 files, 1255 tests green, twice in a row. One
  earlier full run showed a single unnamed failure that never recurred and
  could not be captured; treated as a transient flake.
- No em dashes in new/edited content.

## Manual try path

Hard-refresh the `5173` tab, join a live room: one header row with a
single right-aligned End interview button; status chip absent in steady
state; transcript band above the panes shows full history with its own
scrollbar and follows new turns near the bottom; problem pane holds only
the statement + samples.

## Completion

- **Completed:** 2026-10-12 via `/complete` on branch
  `fix/transcript-band-and-header-consolidation` (head == base ==
  main@2df80a1 at archival).
