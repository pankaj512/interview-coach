# Fix: Submit persists code and feeds the live session

- **Type:** Fix
- **Status:** verified
- **Branch:** `fix/submit-persists-code-and-feeds-the-live-session`

## The problem

The 18d AI-only Submit path is persistence-free by design ("no sandbox run,
nothing persisted"), so everything the candidate submits evaporates: the
verdict shows once in the room card and is gone. Two live-try failures trace
to this (2026-09-27, Mercury interview):

1. The interviewer is blind to Submit verdicts. The voice session context
   (`sandboxSummary`) is minted once at session start and shows "no code
   submitted yet" for the rest of the session, so the model can never
   discuss what the candidate submitted.
2. Results show coding 0/5 "No implementation was submitted" even though the
   candidate wrote and submitted a solution. The async evaluation consumes
   persisted submissions, runs, transcript, and responses; the candidate's
   code lived only in the browser (Submit persists nothing, Test was never
   pressed, the model never called `submit_interview_data` kind=code).

## The fix

Revisit the 18d "no persistence in this pass" scope, in two halves:

1. **Persist the submitted code (backend).** `POST
   /api/interviews/:id/submit-verdict` also stores the code as a
   `CodeSubmission` row through the same `SubmissionService` the Test path
   uses (same problem resolution: explicit `problemId` else the
   interview's current problem), but creates zero `CodeRun` rows - still no
   sandbox run. The verdict itself stays ephemeral (shown in-room, never
   stored). Submits now consume the per-interview submission cap; the
   default cap (100) makes this a non-issue, and sharing the cap with Test
   is the honest accounting.
2. **Feed the verdict to the live interviewer (client).** Push first:
   after a successful verdict, push a short verdict summary into the live
   realtime session through the smallest existing client seam (e.g. a
   conversation item via the voice client), so the model knows the submit
   flow ran and can react unprompted. Additionally, add a canonical voice
   tool (mirroring the `get_candidate_code` precedent) that fetches the
   last saved submission + verdict summary on demand, so the interviewer
   can pull the full saved result when asked about it.

Must not break: the 502/503 verdict error mapping (genuine failures still
surface, unconfigured keys still 503 with plain copy); the Test flow and
its runs; evaluation of interviews with zero submissions (still "No
implementation was submitted", accurately). Honest boundary: with no Test
press, testing evidence stays 0/5 "No execution runs recorded" - this fix
credits coding evidence, not testing evidence.

## Build steps

- [x] 1. Persist Submit code as a run-less submission in the verdict route
  - Route creates the `CodeSubmission` via `SubmissionService` after the
    guards, reusing the resolved problem; no runs, no verdict row, no
    event. Confirm the evaluation reader credits run-less submissions for
    the coding dimension (adjust the reader only if it assumes runs).
  - Done when: route tests prove a Submit creates exactly one submission
    row with zero runs and the 200 verdict shape is unchanged;
    `pnpm typecheck` is clean.
- [x] 2. Push the verdict summary into the live realtime session and add
  a fetch-last-submission voice tool
  - Push via the smallest existing client seam; add the canonical tool
    (name, definition, executor branch, backend read) for on-demand fetch
    of the last saved submission + verdict summary, plus a conductor-prompt
    line telling the model the tool exists and when to call it (after a
    Submit push, or when the candidate refers to submitted code). If the
    push seam proves awkward, record the finding and keep the fetch tool
    with persistence-only push (verdict already visible in-room).
  - Done when: a live try shows the interviewer reacting to a Submit
    unprompted and fetching the saved result when asked, or the push
    descope finding is recorded; focused client tests green; full
    `pnpm test` green; web-client `vite build` succeeds with
    `NODE_OPTIONS=--max-old-space-size=8192`.

## Verify

- `pnpm typecheck` clean; full `pnpm test` green; web-client build passes.
- Manual: Submit code mid-interview, End, check results coding dimension
  no longer says "No implementation was submitted"; confirm the
  interviewer can discuss the submitted verdict live.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4462,"specSha256":"85e9c4c806895a8897133b1a09cfb4b7c0d7b0531649d1977704a4a8ec802d18","branch":"refs/heads/fix/submit-persists-code-and-feeds-the-live-session","head":"f93a56aaeb708fbcfe2388ff0a3c7338891e142e","baseRef":"refs/heads/main","baseCommit":"f93a56aaeb708fbcfe2388ff0a3c7338891e142e","sourceTree":"b55a8e12e12316d3053b44f6777a33da43d583aa","absentOptional":[]} -->
## Completion record

Work branch `fix/submit-persists-code-and-feeds-the-live-session` (base `main@f93a56a`, no prior archive at this path). Submit now persists evidence and feeds the live session, so the interviewer sees submitted code and results stop saying "No implementation was submitted":

- Half 1 — verdict route persists: `POST /api/interviews/:id/submit-verdict` in `packages/backend/src/app.ts` also stores the code via `SubmissionService.submit` (same args as `submitCode`) AFTER proposal validation — only judged submits persist; 400/404/502/503 store nothing, and no code runs execute. The fallback reader already credits run-less submissions (coding 2 "Code submitted but not executed"), so no reader change was needed. Route tests rewritten: 200 expects exactly 1 submission + 0 runs; explicit-problemId test assigns the problem to the interview (F6-6 enforcement).
- Half 2 — push-first + fetch tool: `buildVerdictPushSummary` (pure, in client `voice/session.ts`) formats the verdict; `voice-client.notifySubmission` (sibling of `sendTextMessage`, `[Submit result]` prefix, false when not connected) pushes it; `use-interview.pushVerdictSummary` wired via `LiveScreen` into `CodeWorkspace.submitForVerdict` success path (best-effort). New canonical voice tool `get_last_submission` rides existing `/tool-exec`: domain `tool-service.ts` (`CanonicalToolName`/`CANONICAL_TOOL_NAMES`, `LastSubmissionResult` in the `ToolResult` union, 8000-char trailing cap, dispatch via `latestSubmission`), client `api/types.ts` + `session.ts` definitions + `voice-client.ts` allow-list (no executor change — the default branch already forwards). Backend `voice-session.ts` conductor line tells the model when to fetch (after a Submit push, or when the candidate refers to submitted code).
- Tests: domain `tool-service.test.ts` +2 (found:false, found:true); client `session.test.ts` list 5→6 + definition + push-summary tests; tools-length counts 5→6 (spec-authorized).

Final gates (this session, after all product changes): `pnpm typecheck` clean, full `pnpm test` 75 files / 1211 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`); focused domain tool-service 51/51 and client session+voice-client+code-workspace 51/51.

Honest boundary (unchanged): testing evidence stays 0/5 without Test — no sandbox run happens on Submit. Live push + fetch proof (unprompted interviewer reaction, on-demand fetch) is pending the user's live try.

No findings resolved by this fix; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: the candidate's own submitted code shown to their own session's model at the model's request, plus a persisted submission row through the pre-existing service; no new endpoint, secret, or trust boundary).
