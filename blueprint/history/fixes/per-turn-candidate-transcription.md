# Fix: Per-turn candidate transcription

**Type:** Fix
**Status:** verified
**Branch:** fix/per-turn-candidate-transcription

## The problem

The results page scores communication 0/5 with "responses array is empty" because the candidate's spoken words never reach the backend. `buildSessionUpdate` (`packages/web-client/src/voice/session.ts`) never sets `input_audio_transcription`, which the realtime API requires (opt-in) before it emits `conversation.item.input_audio_transcription.completed` events. The client handles that event (`voice-client.ts:454`) and forwards each turn via `POST /transcript`, but the server never sends it, so `onTranscript` never fires.

Evidence from the live dev DB (read-only): interview `iv_c652` holds 0 `candidate_responses`, 0 tool events, and exactly 1 transcript message (the opening greeting, role `interviewer`). `iv_3da6` holds 26 transcript rows, all `interviewer`. Candidate-role rows are absent everywhere; model-driven `submit_interview_data` recording is sparse (4 interviews ever), so nothing compensates.

## The fix

Add `input_audio_transcription: { model: "whisper-1" }` to the `session.update` built by `buildSessionUpdate`. Voice realtime is Azure-only today (the mint and surrounding comments already assume it), so a literal model name is the smallest complete change; no new config, endpoint, or schema. Per-turn appends then flow through the existing `onTranscript` to `appendTranscript` path, which the backend already validates and persists. Mute/pause need no change: muted mic sends no chunks and pause-suspend disconnects, so there is nothing to transcribe in either state. Resume replay and the room transcript panel gain candidate turns as a side effect.

Must not break: tool definitions and `tool_choice`, assistant transcription, session resume, or the transcript append contract (role `candidate`, content caps).

## Build steps

- [x] Step 1: request input transcription in `session.update` with a unit test.
  - Add the `input_audio_transcription` field in `buildSessionUpdate` (`packages/web-client/src/voice/session.ts`).
  - Extend the existing `session.test.ts` coverage with an assertion that the built update contains it (pure function, no browser needed).
  - Done when: `pnpm typecheck` clean, focused session tests green, full `pnpm test` green, web-client build ok (8GB heap flag as usual).

## Verify

- Automated: typecheck + full test suite + Vite build.
- Manual (needs a live voice try): run an interview, speak several turns, then confirm `interview_messages` holds `candidate`-role rows and the results page scores communication above 0. Live proof stays pending until that try.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2668,"specSha256":"86c14653aee6095f9cdc9ad1db65ea2824ebd15c1526b5b8a5569782e220d37d","branch":"refs/heads/fix/per-turn-candidate-transcription","head":"32d4865bda55f0932752b34c900559cd265e4ffc","baseRef":"refs/heads/main","baseCommit":"32d4865bda55f0932752b34c900559cd265e4ffc","sourceTree":"1a953c655c2e397d5e07ec9686c4279ce0536095","absentOptional":[]} -->

## Completion record

- Product change: `packages/web-client/src/voice/session.ts` (+3: `input_audio_transcription` field with a one-line why-comment); `packages/web-client/tests/session.test.ts` (+1 assertion in the CLI-compatible session.update test).
- Gates (all in-session, after final product edits): `session.test.ts` 20/20, `pnpm typecheck` clean, full `pnpm test` 77 files/1244 green, web-client Vite build ok (8GB heap flag; chunk-size warning pre-existing).
- Live proof (candidate rows in `interview_messages`, communication above 0) pending the user's live voice try; client-only change, no server restart needed.
- Findings ledger untouched (F-01..F-04 fixed P2/P3 retained; F-05 P2 + F-06/F-07 P3 open; no P0/P1). No independent review (small client-only change, non-sensitive).
