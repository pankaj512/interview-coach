# Fix: Resume from where left off

- **Type:** Fix
- **Status:** verified
- **Branch:** `fix/resume-from-where-left-off`

## The problem

Pause then resume reconnects the voice session but restarts the conversation.
`resumeVoice` (`packages/web-client/src/state/use-interview.ts:224`) calls
`client.reconnect()`, which runs the same `connect()` path as a fresh join:
`session.update` then a bare `response.create`
(`packages/web-client/src/voice/voice-client.ts:260-277`). The model follows
the mint's Opening behavior
(`packages/backend/src/voice-session.ts:180`) and greets plus restates the
problem, ignoring everything said before the pause. The pre-pause turns exist
(client `events` with kinds `candidate`/`assistant`, `use-interview.ts:44-48`,
also forwarded to the server transcript) but nothing replays them into the new
realtime session.

## The fix

Client-only resume continuity; no backend, mint, instruction, or dependency
changes. On resume, replay the pre-pause transcript turns into the fresh
realtime session as `conversation.item.create` message items (the same event
the client already sends for `function_call_output`, `session.ts:125-135`),
then prompt the model to continue instead of re-greeting:

- New pure builder beside usage (e.g. in `voice/session.ts`): takes the live
  `events`, keeps kinds `candidate`/`assistant` in chronological order, maps
  to message items (`candidate` to role `user`, `assistant` to role
  `assistant`), capped (last ~30 turns / ~8k chars) to bound replay size, and
  appends a short resume nudge item telling the interviewer the session was
  paused and to continue exactly where it left off without re-greeting.
- Thread an optional resume payload through `reconnect(history?)` into
  `connect()`: after the session ack, send the history items first, then the
  existing `response.create`. When absent (fresh join, Retry rejoin, or empty
  pre-pause history), the greeting path is byte-for-byte unchanged.
- `use-interview.ts`: keep an `eventsRef` mirror of the events state;
  `resumeVoice` builds the history from it and passes it to `reconnect`.
  Pause-before-first-turn resumes exactly as today.
- Must not break: fresh-join greeting, pending tool-output replay
  (`flushPendingOutputs`), the frozen session config, mute mic-only behavior,
  or the pause availability gating.

Out of scope: Symptom 1 (problem+editor flash before the waiting UI after
lobby Begin) stays open and blocked pending runtime evidence; untouched by
this fix.

## Build steps

1. Add the pure resume-history builder plus focused unit tests (mapping,
   ordering, caps, empty input, nudge present).
   Done when: `pnpm --filter @interview-coach/web-client test` (or the
   package's configured runner) passes the new cases.
2. Wire resume history through `reconnect`/`connect` and `resumeVoice`;
   verify greeting path unchanged when no history is passed.
   Done when: pause mid-conversation then resume replays the turns and the
   interviewer continues the thread instead of greeting, while a fresh join
   still greets; `pnpm typecheck`, full `pnpm test`, and the web-client
   `vite build` pass.

## Verify

- Live try: hold a short exchange with the interviewer, Pause, Resume. The
  interviewer continues from the prior exchange (references what was said)
  instead of greeting and restating the problem.
- Regression: fresh join still greets by name and states the problem;
  pause-resume with no prior turns behaves exactly as before.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3483,"specSha256":"5d4f75d8b017c0b41e6179dcb151d9a612cd120cafb441d6c3e69ceed7b7f2f8","branch":"refs/heads/fix/resume-from-where-left-off","head":"46df82d9da9c60337751d5c9a6d03ae924358bb2","baseRef":"refs/heads/main","baseCommit":"46df82d9da9c60337751d5c9a6d03ae924358bb2","sourceTree":"7eb57f2bc2bd8fcfa270c6832d675eecbf1b982d","absentOptional":[]} -->
## Completion record

Work branch `fix/resume-from-where-left-off` (base `main@46df82d`, no prior archive at this path). Client-only resume continuity; no backend, mint, instruction, or dependency changes:

- `packages/web-client/src/voice/session.ts`: new pure `buildResumeHistory(events)` plus `ResumeTurn` input type. Keeps `candidate`/`assistant` turns in chronological order, maps to `conversation.item.create` message items (`user`/`input_text`, `assistant`/`output_text`, same envelope shape as the existing `buildFunctionCallOutput`), skips tool/connection/empty entries, caps replay at the last 30 turns / 8000 chars (oldest dropped, lone oversized turn tail-truncated), and appends a user-role nudge telling the interviewer the session was paused and to continue where it left off without re-greeting. Empty input returns `[]`.
- `packages/web-client/src/voice/voice-client.ts`: `connect()` takes an optional `{resumeHistory}`, sent after the session ack and before `response.create`; `reconnect(history?)` passes it through (exact-optional-types safe). No history means the fresh-join greeting path is unchanged; the echoed `conversation.item.created` events for replayed messages are already ignored by the `function_call`-only handler, and item replay cannot trigger a stray response (only `response.create` does).
- `packages/web-client/src/state/use-interview.ts`: `eventsRef` mirror of the transcript feed (same 200-entry window as state); `resumeVoice` builds history at click time and passes it only when non-empty, so pause-before-first-turn resumes exactly as before.
- Tests: `tests/session.test.ts` gains 5 builder cases (role mapping/order, nudge wording, non-spoken/empty ignored, 30-turn cap, char-budget drop + lone-turn truncation); `tests/voice-client.test.ts` gains 1 wiring case (3 replay items before the greeting `response.create`; plain connect sends no `item.create`).

Final gates (this session, after all product changes): `pnpm typecheck` clean, full `pnpm test` 69 files / 1145 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`). Live continuity proof (interviewer references the pre-pause exchange instead of greeting) is pending the user's live try; documented in the spec Verify section.

No findings resolved by this fix; F-01-F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: client-side replay over the pre-existing voice session using the existing realtime event shape; no new endpoint, secret, or trust boundary). Symptom 1 (room flash before the waiting UI) untouched, still blocked on runtime evidence.
