# Fix: Interview room flash on join

**Type:** Fix
**Status:** verified
**Branch:** `fix/interview-room-flash`

## The problem

After lobby Begin, the full interview room (problem panel + code editor)
flashes on screen before the "Joining the interview…" waiting UI, then the
waiting UI appears, then the room returns. User screencast
(`Screencast From 2026-09-25 19-08-35.mp4`, 8 s) frame sequence at 5 fps:
lobby (`Preparing your interview`) → connected room → `Connecting` waiting
card → connected room again.

Root cause, confirmed in code (no runtime logging needed — the mechanism is
deterministic):

- `LiveScreen.tsx:78-83` auto-joins on mount (`handleJoin` → `live.start()`).
- The app runs under `StrictMode` (`main.tsx:10-12`), so dev mounts
  LiveScreen twice: mount 1 fires `start()` (async mint/mic/connect in
  flight), then the simulated-unmount cleanup runs `hangup()`
  (`use-interview.ts:335-337`), which calls `setConnection("closed")`
  (`use-interview.ts:200`) while no client exists yet.
- `inRoom` includes `"closed"` (`LiveScreen.tsx:87`), so the room renders
  immediately — with full content, because the lobby's `fallbackProblem`
  (`LiveScreen.tsx:94`) plus editor starter prefill need no snapshot.
- The in-flight `start()` then drives `connecting` (waiting card) →
  `connected` (room), producing room → waiting → room.

`closed` belongs in `inRoom` for the pause-suspend path (post-join suspend
must keep the room), but a pre-join `closed` (StrictMode cleanup, or any
remount before the first connect) must not render the room.

## The fix

Gate `closed` as in-room only after the session actually joined:

- `useLiveInterview` tracks a `joinedRef`, set the first time
  `onConnectionState` reports `"connected"`, and exposes it as `hasJoined`.
- `LiveScreen` computes `inRoom` as `connected` / `reconnecting` /
  (`closed` **and** `hasJoined`). Pre-join `closed` renders the join card
  ("Joining…", which is accurate — `start()` is in flight).
- Pause-suspend is unaffected: suspend happens only after connect, so
  `hasJoined` is true and the paused room stays. Unexpected close
  post-connect behaves exactly as today.
- Put the gating in a tiny pure helper (same pattern as
  `pauseAvailability`) so it is unit-testable; vitest runs in node, no DOM.

Must not break: pause/resume room persistence, Retry on `failed`, End
interview flow, snapshot/content loading.

## Build steps

1. [x] Add `hasJoined` to `useLiveInterview` and gate `closed` in `inRoom`
   behind it via a pure helper. Done when `Begin` goes lobby → waiting
   card → room with no room flash, and pausing still keeps the room with
   a frozen timer.
2. [x] Add unit tests for the helper (pre-join closed → join card; post-join
   closed → room; connected/reconnecting unchanged). Done when the new
   tests pass alongside the suite.

## Verify

- `pnpm typecheck` clean, full `pnpm test` green, web-client `vite build`
  passes.
- Manual (dev server): lobby Begin → waiting card straight through to the
  room, no problem/editor flash; then Pause keeps the room, Resume
  reconnects. The screencast above is the before-evidence; the manual try
  is the after-proof.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3205,"specSha256":"e6cc81acd37c233a99859288a9e7f4db92c005c669b4095ac9bc4939fba327d3","branch":"refs/heads/fix/interview-room-flash","head":"a4fb45f87c92373349b8dda28fd6f8e947d14252","baseRef":"refs/heads/main","baseCommit":"a4fb45f87c92373349b8dda28fd6f8e947d14252","sourceTree":"18c8a20cfbbe423e40d4f8e88366e7232a798533","absentOptional":[]} -->
## Completion record

Work branch `fix/interview-room-flash` (base `main@a4fb45f`, no prior archive at this path). Gates the interview room on first successful join so a pre-join `closed` renders the join card:

- `packages/web-client/src/state/use-interview.ts`: new `joinedRef`, set on the first `onConnectionState("connected")`, exposed as `hasJoined` (read per render; no extra renders). Never reset for the screen instance lifetime, so pause-suspend (post-join `closed`) keeps the room.
- `packages/web-client/src/screens/LiveScreen.tsx`: new pure `isRoomVisible(connection, hasJoined)` (`connected`/`reconnecting` always room; `closed` only when joined; all other states join card); `inRoom` uses it. Type-only `VoiceConnectionState` import.
- `packages/web-client/tests/code-workspace.test.ts`: 3 new `isRoomVisible` cases (pre-join `idle`/`connecting`/`closed` → card; post-join `closed` → room; `connected`/`reconnecting`/`failed` unchanged).

Final gates: `pnpm typecheck` clean (implement + complete sessions), full `pnpm test` 1148 green and web-client `vite build` passes with the pre-existing 8GB heap flag (implement session; product untouched since), focused code-workspace 16/16 (both sessions). Manual dev try (lobby Begin → waiting card straight to room; Pause keeps room, Resume reconnects) is documented in the spec Verify section and left to the user; the user screencast is the before-evidence. Must-not-break review: pause/resume persistence, Retry on `failed`, End flow, snapshot loading all preserved.

No findings resolved by this fix; F-01-F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: client-only visibility gating reusing the existing connection lifecycle; no new endpoint, secret, or trust boundary).
