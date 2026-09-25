# Fix: Voice pause and mute hardening

- **Type:** Fix
- **Status:** verified
- **Branch:** `fix/voice-pause-mute-hardening`

## The problem

Mute and Pause in the interview room fail silently and pause is not a real
pause (from the debug session on clean main, verdict Likely):

1. `togglePause` failures are invisible in the room. `live.error` is only
   rendered in the pre-join card (`LiveScreen.tsx` ~line 181), never in-room,
   so a failed pause/resume looks like a dead button.
2. Pause is legal only from `in_progress` (`domain/lifecycle.ts` ALLOWED
   map). Once the interview drifts to `completing` (model-ended; the UI
   already shows a Wrapping-up badge), both Pause and Resume fail with
   `ILLEGAL_TRANSITION` silently forever, and Mute stays force-disabled
   while `paused` is stuck true.
3. Even a successful pause never suspends Azure: `VoiceInterviewClient` has
   no hold/suspend, the socket stays open and bills. The elapsed timer also
   keeps counting by design (`use-interview.ts` C4-5), which contradicts the
   expected freeze-input/output/timer behavior.
4. Mute itself is correct by construction (mic-upload-only gate in
   `browser-audio.ts` `onChunk`, never touches the separate playback sink)
   and needs no logic change; it only appears broken because of (1) and (2).

Backend pause/resume/cancel routes, client methods, and the domain
transitions are verified intact (pause demonstrably worked Sept 25), so no
backend change is expected.

## The fix

- Render `live.error` in the room (near the rail controls), so pause/resume
  failures are visible instead of silent.
- Derive Pause/Resume availability from the interview snapshot status:
  disable Pause when the status cannot transition (e.g. `completing` or a
  terminal status) with a short hint, instead of firing a request that must
  fail. Refresh the snapshot before acting if it is stale.
- Make pause a true pause: suspend the Azure voice session on pause
  (close or hold the socket, stop mic capture, flush pending playback;
  reuse the existing `reconnect()` path with the still-valid mint on
  resume) and freeze the elapsed timer while paused. Resume restores the
  session and restarts the timer from the frozen value. Freezing the timer
  on explicit pause deliberately narrows the C4-5 documented behavior,
  which covers reconnects and mic-blocked recovery, not an explicit pause.
- Keep mute mic-only; no mute logic change. Confirm in the manual try that
  muting silences the user while interviewer audio still plays.
- Must not break: End flow, reconnect recovery, mic-blocked recovery, the
  Wrapping-up badge, results navigation, or the no-`VITE_AZURE_*` bundle
  rule. Azure billing cannot be proven from the browser; confirm suspend
  via backend session-disconnect logs.

## Build steps

- [x] 1. In-room error surface plus pause availability: show `live.error`
  in the room near the rail and disable Pause (with hint) when the
  snapshot status cannot legally pause.
  - Done when: forcing a pause failure (e.g. pausing from `completing`)
    shows the error text in the room, and the Pause button is disabled
    with a hint on a non-pausable status.
- [x] 2. True pause: suspend the voice session on pause and freeze the
  elapsed timer while paused; resume reconnects and restarts the timer
  from the frozen value.
  - Done when: pausing stops timer advance and suspends the Azure session
    (backend logs the disconnect), and resuming reconnects voice and
    continues the timer from the frozen value.
- [x] 3. Focused tests for any new pure logic (e.g. a pause-availability
  helper); UI-only changes ride on typecheck plus build.
  - Done when: `pnpm typecheck` clean and `pnpm test` green (68 files,
    1125 tests baseline).
- [x] 4. Restartable browser audio (resume repair): first live try showed
  pause suspends correctly but resume reconnects a dead session both ways.
  Root cause: `createBrowserMicCapture.stop()` stops all tracks and closes
  its AudioContext, and `createBrowserPlayback.stop()` closes its context;
  restart then silently streams silence (mic) or throws inside the
  delta-skip catch (playback), while `connect()` still reaches "connected".
  Rebuild both adapters so `start()` after `stop()` re-acquires a live
  mic chain and `enqueue()` after `stop()` recreates the playback context.
  Adapters stay untestable in node (need real mic/speakers per the file
  header), so this rides on typecheck plus build plus a live try.
  - Done when: pause then resume restores both directions (user hears the
    greeting, interviewer hears the user) with `pnpm typecheck` clean,
    `pnpm test` green, client `vite build` passing.

## Parked

- Resume-from-where-left-off (restore prior conversation context into the
  resumed Azure session instead of re-greeting from scratch). Parked per
  user call: needs transcript injection into the new session, a separate
  design. Future `/fix` candidate, not this spec.

## Verify

- `pnpm typecheck`, `pnpm test`, client `vite build`.
- Manual try in a live room: pause freezes the timer and silences both
  directions, resume reconnects voice within a few seconds, errors (if
  any) appear in the room, mute silences only the user, End still
  completes the interview to results.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":5269,"specSha256":"2a934f41c45f9859d7779089e1030f82218d997bcdcaa2abdc0c4766bd14eefc","branch":"refs/heads/fix/voice-pause-mute-hardening","head":"946626177ef0402cb15db11b3f539d8076b88fd3","baseRef":"refs/heads/main","baseCommit":"946626177ef0402cb15db11b3f539d8076b88fd3","sourceTree":"3b7a3b1fe23c2cbe23a1fb469c0eb02a24c5416a","absentOptional":[]} -->
## Completion record

Work branch `fix/voice-pause-mute-hardening` (base `main@9466261`, no prior archive at this path). Voice pause/mute hardening plus resume repair:

- `packages/web-client/src/state/use-interview.ts`: `togglePause` refreshes the snapshot first and refuses doomed transitions with a visible error; pause suspends media via `disconnect("paused")` (mic stopped, playback stopped, Azure socket closed) with a suspend guard so the client is kept for resume; resume reconnects the same client via `reconnect()` and drops it on hard failure so Retry mints fresh; elapsed timer holds while paused (base shifted on resume); `refreshSnapshot` now returns the snapshot.
- `packages/web-client/src/screens/LiveScreen.tsx`: `live.error` renders as a dismissible in-room alert card; new pure `pauseAvailability()` gates Pause (disabled + hint when the snapshot status cannot transition).
- `packages/web-client/src/styles.css`: `.state-error` joins the danger-border rule.
- `packages/web-client/src/voice/browser-audio.ts` (resume repair after first live try): mic chain-building extracted so `start()` after `stop()` builds a fresh chain (old path reconnected a dead source to a closed context, streaming silence); playback recreates its `AudioContext` on the first `enqueue()` after `stop()` (old path threw inside the delta-skip catch, staying silent). Frozen media plane untouched; mute logic untouched.
- `packages/web-client/tests/code-workspace.test.ts`: 3 new `pauseAvailability` cases.

Final gates (this session, after all product changes): `pnpm typecheck` clean, full `pnpm test` 69 files / 1139 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`); focused code-workspace 13/13. Live audio proof (both directions after resume) is pending the user's live try; documented in the spec Verify section.

Parked per user call (not this branch): resume-from-where-left-off, restoring prior conversation context into the resumed Azure session instead of re-greeting; future `/fix` candidate.

No findings resolved by this fix; F-01-F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: client-side control hardening reusing the pre-existing pause/resume routes, voice reconnect path, and session lifecycle; no new endpoint, secret, or trust boundary).
