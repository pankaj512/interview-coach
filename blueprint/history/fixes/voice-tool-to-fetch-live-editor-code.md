# Fix: Voice tool to fetch live editor code

- **Type:** Fix
- **Status:** verified
- **Branch:** `fix/voice-tool-to-fetch-live-editor-code`

## The problem

When the candidate asks the interviewer "can you see my code?", the model
truthfully answers it cannot. The advertised realtime tool surface
(`packages/web-client/src/voice/session.ts:34-74`) has four tools
(`get_current_interview`, `get_current_problem`, `submit_interview_data`,
`end_interview`), none of which reads editor content, and the instructions
(`packages/backend/src/voice-session.ts:220-224`) explicitly tell the model
that candidate code is invisible ("the candidate runs code in the app
workspace - ask them to share the outcome"). Live code lives only in
`CodeWorkspace` local state (`code`/`codeRef`,
`packages/web-client/src/components/CodeWorkspace.tsx:86,101-102`) and
leaves the browser only on Test via `backend.submitCode`. Every tool call
round-trips to the backend (`use-interview.ts:127-128` to `POST
/api/interviews/:id/tool-exec`, dispatched on backend-owned state in
`app.ts:1449`), and the backend never sees keystrokes, so no server-side
tool can fetch live code either. This is a missing capability, not a
regression (debug verdict Confirmed, 2026-09-26).

## The fix

Add a fifth canonical tool, `get_candidate_code`, answered locally in the
browser from the live Monaco content and never forwarded to `/tool-exec`:

- Advertise it in `REALTIME_TOOL_DEFINITIONS` (web model only; the
  deprecated CLI-harness aliases stay untouched).
- Extend `CanonicalToolName` in `packages/web-client/src/api/types.ts`.
- Branch the tool executor in `use-interview.ts`: `get_candidate_code`
  is answered from a registered live-code reader (language + current
  content, capped near 8k chars with a truncation flag, reusing the
  existing `function_call_output` envelope and exactly-once ledger);
  all other tools keep the current `backend.toolExec` path with its
  retry policy unchanged.
- Register the reader where the executor can reach it: `CodeWorkspace`
  owns the live code, so expose a reader callback/ref up through
  `LiveScreen` into the interview hook. Smallest prop/ref path that
  avoids a new store or context.
- Update the backend instructions conduct lines: the model CAN see live
  editor code via `get_candidate_code` and must call it when the
  candidate asks about their code or when discussing implementation.
  Execution outcomes still come from the candidate (Test row), as today.

Must not break: the four existing tools, the forwarder retry policy and
ledger, pause/resume voice suspend, reconnect output recovery,
Test/Submit flows, or CLI-harness alias compatibility. Backend
`tools.dispatch` is unchanged (it never receives this tool).

## Build steps

- [x] 1. Client tool surface + local execution: new definition, type, executor
   branch, reader registration from `CodeWorkspace` through `LiveScreen`.
   Done when `pnpm typecheck` is clean and a unit test covers the output
   builder (shape, empty code, truncation cap).
- [x] 2. Backend instructions update so the model actually calls the tool.
   Done when the conduct lines state live-code visibility via
   `get_candidate_code` and typecheck plus backend tests still pass.
- [x] 3. Full gates: `pnpm test` green, web-client `vite build` succeeds.

## Verify

- Automated: `pnpm typecheck`, full `pnpm test`, web-client build.
- Manual (needs a live voice session): type code in the editor, ask "can
  you see my code?" - the interviewer reads back the actual content.
  Regression: the other four tools, pause/resume, and Test still behave
  as before.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3621,"specSha256":"6c85b04da4168f4cb8af2f2ac3432f341c392ce70aab713f2a13b0a3a4ff12be","branch":"refs/heads/fix/voice-tool-to-fetch-live-editor-code","head":"f7f330f43359c5f268092ff805c136872f94b08f","baseRef":"refs/heads/main","baseCommit":"f7f330f43359c5f268092ff805c136872f94b08f","sourceTree":"4e3359941073e96251a260200fe690ee23e20a6e","absentOptional":[]} -->
## Completion record

Work branch `fix/voice-tool-to-fetch-live-editor-code` (base `main@f7f330f`, no prior archive at this path). Fifth canonical voice tool `get_candidate_code`, answered locally in the browser:

- `packages/web-client/src/api/types.ts`: `CanonicalToolName` gains `get_candidate_code`.
- `packages/web-client/src/voice/session.ts`: `REALTIME_TOOL_DEFINITIONS` entry (model reads the candidate's current editor content; 8000-char cap; empty editor is a definitive answer); new `LiveCodeSnapshot`/`LiveCodeReader`/`CandidateCodeResult`, `CANDIDATE_CODE_MAX_CHARS`, `buildCandidateCodeResult` (trailing-window truncation), `resolveCandidateCode` (ToolExecOutcome shape; missing reader is 404 NO_EDITOR_CONTENT, retryable false).
- `packages/web-client/src/voice/voice-client.ts`: `VALID_TOOL_NAMES` gains the entry.
- `packages/web-client/src/state/use-interview.ts`: `UseLiveInterviewOptions.codeReader` plus a `get_candidate_code` branch in the tool executor that returns the local snapshot and never forwards to the backend.
- `packages/web-client/src/components/CodeWorkspace.tsx`: optional `codeReaderRef` prop with a registration effect reading `codeRef`/`languageRef`; cleared on unmount.
- `packages/web-client/src/screens/LiveScreen.tsx`: `codeReaderRef` declared above the hook call, wired into hook options and `CodeWorkspace`.
- `packages/backend/src/voice-session.ts`: conduct instructions updated — the model CAN read live code via `get_candidate_code`; run outcomes still come from the candidate, never invented.
- Tests: `tests/session.test.ts` list 4→5 plus 6 new cases (tool declaration, result shape, empty editor, truncation, local resolve, missing reader); `tests/voice-client.test.ts` count 4→5 (both count updates spec-authorized).

Final gates (this session, after all product changes): `pnpm typecheck` clean, focused session + code-workspace + voice-client + render-smoke 75/75, backend voice-session suite 12/12, full `pnpm test` 69 files / 1154 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`). Live model-readback proof (ask the interviewer what it sees in the editor) is pending the user's live try; documented in the spec Verify section.

No findings resolved by this fix; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: the candidate's own editor content is shown to their own session's model at the model's request; no new endpoint, secret, or trust boundary).
