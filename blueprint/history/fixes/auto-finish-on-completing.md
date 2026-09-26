# Fix: Auto-finish the room when the interview reaches completing

- **Type:** Fix
- **Status:** verified
- **Branch:** `fix/auto-finish-on-completing`

## The problem

When the candidate ends the interview verbally, the model calls the
`end_interview` voice tool, which transitions the interview to `completing`
and stops there by design (`packages/backend/src/app.ts:1004-1006`; the tool
description even tells the model to "continue the conversation naturally
afterwards", `packages/web-client/src/voice/session.ts:80`). Nothing ever
moves it further: only the app End button finalizes
(`POST /end` -> `complete()`; client `finish()` = hangup + endInterview +
setFinished in `packages/web-client/src/state/use-interview.ts`). The voice
socket stays open and the room sits on the "Wrapping up" badge
(`packages/web-client/src/screens/LiveScreen.tsx:202-204`,
`snapshot.status === "completing"`) forever. Live evidence: Mercury
interview screenshot, room Connected with Pause disabled and no way forward
short of pressing End. Pause stays correctly disabled in this state (pause
is only legal from `in_progress`), so the room looks dead.

## The fix

Two coordinated halves, client + model instruction:

1. **Tool instruction (client tool definition).** Reword the
   `end_interview` tool description in
   `packages/web-client/src/voice/session.ts` (line 80 — this is the text
   actually sent to the realtime model; the backend conduct line in
   `packages/backend/src/voice-session.ts:227` already agrees and stays
   untouched) so the call order is explicit: the model says its final
   goodbye FIRST, then calls `end_interview` as its very last operation,
   and says nothing further after the call returns. This replaces the
   current "continue the conversation naturally afterwards" wording, which
   strands the session in post-tool small talk with the socket open.
   (Spec correction during implement: the tool description lives in the
   client session definition, not the backend file.)
2. **Auto-finish (client).** Watch the live snapshot in `use-interview.ts`:
   when `snapshot.status` becomes `"completing"`, hang up the voice session
   and run the exact same `finish()` path the End button uses, exactly
   once, after a short beat (covering tool-call latency now that the
   goodbye precedes the call, not clipping it). The lifecycle machine is
   unchanged: `end_interview` still stops at `completing`.

Must not break: the manual End-button flow (already `completed` or
`finishing` must never double-finish), pause/resume, reconnect/Retry, and
the join-flash gate (`hasJoined`). The auto-finish must be a no-op when the
interview is already finished or a finish is already in flight.

## Build steps

- [x] 1. Reword the `end_interview` tool description (client tool definition)
  - Goodbye first, tool call last, silence after: update the description
    in `packages/web-client/src/voice/session.ts` and any test asserting the
    old "continue naturally" text (none found — only tool names are pinned).
  - Done when: client session tests pass; `pnpm typecheck` is clean.
- [x] 2. Auto-finish once on completing in `use-interview.ts`
  - Add a `finishedRef`-style once-guard beside the existing
    suspending/starting guards; when the refreshed snapshot reports
    `completing` and no finish has run, wait a short beat, then call the
    existing `finish()` (hangup + endInterview + setFinished), reusing it
    verbatim rather than duplicating its steps.
  - Extract the pure decision (`status === "completing"` and not already
    finished/finishing) into a unit-testable helper beside
    `pauseAvailability` / `isRoomVisible`.
  - Done when: a unit test proves the helper fires only for `completing`
    and only once; `pnpm typecheck` is clean; the full `pnpm test` suite is
    green; the web-client `vite build` succeeds
    (`NODE_OPTIONS=--max-old-space-size=8192`).

## Verify

- Unit: new helper tests in the existing client test file.
- Manual (needs a voice interview + backend): start an interview, end it
  verbally ("let's wrap up"); the goodbye plays, then the room closes the
  socket and flows to evaluating/results with no End press. Pressing End
  manually in a normal interview still works exactly once. Pause stays
  disabled once completing begins.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4305,"specSha256":"cfd8fa7cc44323a828ca50ae93474bc34aa7b09ea4b1232ead72d36f74fa3b6b","branch":"refs/heads/fix/auto-finish-on-completing","head":"7a3814a127e5c04401ac41effeb38f738e2f6640","baseRef":"refs/heads/main","baseCommit":"7a3814a127e5c04401ac41effeb38f738e2f6640","sourceTree":"406a4e73561d609aaf13987134069f82da57ef32","absentOptional":[]} -->
## Completion record

Work branch `fix/auto-finish-on-completing` (base `main@7a3814a`, no prior archive at this path). Verbal interview ends no longer strand the room in `completing` limbo.

- `packages/web-client/src/voice/session.ts`: `end_interview` tool description reworded — the model says its final goodbye FIRST, then calls `end_interview` as its very last operation, and says nothing further after the call returns (replaces "continue the conversation naturally afterwards", which kept the socket open in post-tool small talk). The description lives in the client realtime tool surface, not the backend; backend conduct line already agreed and is untouched.
- `packages/web-client/src/state/use-interview.ts`: `AUTO_FINISH_DELAY_MS` (2000) plus pure `shouldAutoFinish(status, finished, scheduled)` beside the other room-visibility predicates, plus a once-guarded effect that runs the exact End-button `finish()` (hangup + `endInterview` + `setFinished`) when the refreshed snapshot is `completing`. Manual End during the beat wins via the finished flip; the lifecycle machine is unchanged (`end_interview` still stops at `completing`).
- `packages/web-client/tests/code-workspace.test.ts`: `shouldAutoFinish` cases (fires only from fresh `completing`; never refires; quiet for all other statuses).

Final gates (this session, after all product changes): `pnpm typecheck` clean, focused code-workspace + session suites 37/37, full `pnpm test` 75 files / 1203 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`). Live proof (goodbye → tool call → ~2 s beat → hangup → evaluating → results) is pending the user's live try; documented in the spec Verify section.

No findings resolved by this fix; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: client-side finish-path reuse plus model-facing copy; no new endpoint, secret, or trust boundary).
