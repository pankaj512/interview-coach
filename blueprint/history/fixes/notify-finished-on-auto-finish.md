# Fix: Notify the app when auto-finish completes

**Type:** Fix
**Status:** verified
**Branch:** `fix/notify-finished-on-auto-finish`

## The problem

When the model ends the interview, the room strands on "Session closed" and never transitions to evaluation; the user must click End interview manually. Deeper diagnosis (2026-09-29, `iv_26ae…` plus `iv_3da6…`/`iv_53bb…`): the backend DOES reach `completed` ~4s after `end_interview` — the client's auto-finish `finish()` runs and `POST /end` succeeds — but the UI never leaves the room.

Root cause in `packages/web-client/src/screens/LiveScreen.tsx:146-150`: only the manual End button calls `onFinished()` (which drives App to `evaluating`, `App.tsx:327-343`). The auto path sets `finished=true` inside `finish()` (`use-interview.ts:378-395`), and nothing observes `live.finished` — grep confirms `LiveScreen` never reads it. The prior refresh-on-close attempt treated this as a snapshot-visibility problem; the snapshots arrive fine, the notification is what's missing.

## The fix

`LiveScreen` watches `live.finished` and calls `onFinished(live.snapshot, live.events, live.elapsedSec)` exactly once via a `notifiedRef`: the manual `handleConfirmEnd` marks it notified around its direct `onFinished` call, and the effect fires only for an un-notified flip (the auto path). Pure helper `shouldNotifyFinished(finished, notified)` beside the other screen predicates, covered by unit tests in the existing client test file. No backend, prompt, timer, or polling change. Must not break: manual End still notifies exactly once (no double `evaluating` timers), pause/mute/suspend semantics untouched.

Note: the worktree also carries the uncommitted refresh-on-close effect + `shouldRefreshOnClose` tests from the superseded drop-spec attempt; retain them as a supporting change (they get the client a fresh snapshot promptly after a drop) — no separate spec or archive for that attempt.

## Build steps

- [x] 1. Notify-once effect in `LiveScreen.tsx` + `shouldNotifyFinished` helper + unit tests.
  Done when the helper tests pass, `pnpm typecheck` is clean, the full suite is green, and the 8GB web build passes.

## Verify

- `pnpm typecheck`, `pnpm test` (full suite), vite build.
- Manual live try: model-ended interview auto-transitions room → evaluating with no End click (the exact strand from the screenshot).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2385,"specSha256":"d90719d4f656147db4fd87475a6f6a572897e278743501f25654999597b23850","branch":"refs/heads/fix/notify-finished-on-auto-finish","head":"4045adc01a3112d2b5675cd019ea38b1481773dc","baseRef":"refs/heads/main","baseCommit":"4045adc01a3112d2b5675cd019ea38b1481773dc","sourceTree":"973eceafb24d6cb86f00fa7b4904de1d9b3d40b5","absentOptional":[]} -->

## Completion record

- Landed `shouldNotifyFinished(finished, notified)` + `finishedNotifiedRef` + notify-once effect in `LiveScreen.tsx`; manual `handleConfirmEnd` marks notified before its direct `onFinished` call. Retained the refresh-on-close effect + `shouldRefreshOnClose` in `use-interview.ts` as a supporting change. Tests: 3 `shouldNotifyFinished` cases in `code-workspace.test.ts`.
- Gates: focused 25/25, `pnpm typecheck` clean, full `pnpm test` 77 files/1225 green, vite build ok (8GB heap flag).
- Live proof: user tried a model-ended interview after the fix — room auto-transitioned to Evaluating with no End click. Manual End path is untouched code.
- Findings/review: nothing resolved, no review — ledger (F-01..F-04 fixed, F-05 P2 + F-06/F-07 P3 open) and review stub left intact.
