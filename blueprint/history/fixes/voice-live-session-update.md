# Fix: Voice Live session.update rejected by Azure

**Type:** Fix
**Status:** verified
**Branch:** `fix/voice-live-session-update`

## The problem

Starting a live interview fails after a successful mint. The browser opens the
Azure WebSocket and receives `session.created`, then Azure rejects our
`session.update` and closes the socket after 5 config attempts
(`max_config_attempts_exceeded`). The UI shows "voice connection lost" plus a
spam of `WebSocket is already in CLOSING or CLOSED state` errors. Reproduced
with Playwright (`/tmp/opencode/repro_voice.py`): mint 201
(`api-key-local-dev`), `session.created` OK, then rejection.

Three defects found in the captured frames:

1. **Voice name rejected.** We send `"voice": "en-US-Andrew:DragonHDLatestNeural"`
   (backend default, `packages/backend/src/config.ts`). Azure answers
   `'session.voice' should be 'alloy', 'ash', 'ballad', 'coral', 'echo',
   'sage', 'shimmer', 'verse', 'marin' or 'cedar'`
   (`invalid_session_update_message`, param `session.voice`).
2. **session.update schema mismatch.** `buildSessionUpdate`
   (`packages/web-client/src/voice/session.ts`) sends fields the endpoint does
   not accept: `input_audio_echo_cancellation` /
   `input_audio_noise_reduction` objects (the server's own `session.created`
   nulls both) and extra `turn_detection` subfields (`speech_duration_ms`,
   `silence_duration_ms`). The exact rejecting field needs a bisect against the
   live endpoint; the server error text is misleading (param `type`).
3. **Stale tool names in instructions.** `BASE_INSTRUCTIONS`
   (`packages/backend/src/voice-session.ts`) tells the model to call
   `get_problem_hint`, `record_candidate_answer`, `submit_solution`,
   `run_code`, `get_interview_configuration`, `get_candidate_performance`,
   but the client advertises only the Phase-8 four (`get_current_interview`,
   `get_current_problem`, `submit_interview_data`, `end_interview`).

Also observed: the mic worklet keeps streaming PCM into the dead socket after
close (the CLOSING/CLOSED spam). Cosmetic, fixed by stopping audio on close.

## The fix

- Default `AZURE_VOICE_VOICE` to an endpoint-allowed name (e.g. `ballad`);
  keep the env override. Update `.env.example` accordingly.
- Live bisect result (2026-09-21, `/tmp/opencode/probe_session.py`): with a
  valid voice, EVERY field group is accepted (`minimal`, `voice`, `turn`,
  `aec`, `fmt`, `tools`, `all` all reach `session.updated`), and the full
  current payload + `response.create` reaches `response.created`. The voice
  name was the sole rejecting field; the earlier `type`-param errors were
  cascade noise after the voice rejection. `buildSessionUpdate` needs no
  schema change.
- Rewrite the instruction tool passages to name only the four advertised tools.
- Stop the mic/audio pipeline when the voice connection closes or fails.
- Must not break: mint flow, frozen session config plumbing, tool forwarder
  names, existing voice unit tests (update fixtures where the schema changed).

## Build steps

1. **Voice default** - change the `AZURE_VOICE_VOICE` default plus
   `.env.example`; add a unit test asserting the default is in the allowed
   set. Done when backend test passes and mint carries the new default.
2. **session.update alignment** - bisect payload fields against the live
   endpoint with the Playwright repro; adjust `buildSessionUpdate` and its
   unit fixtures to the accepted schema. Done when the repro reaches
   `session.updated` and the greeting `response.create` succeeds.
3. **Instructions + mic teardown** - update `BASE_INSTRUCTIONS` tool names;
   stop audio streaming on connection close/fail. Done when instructions name
   only advertised tools and the repro console shows no post-close send spam.

## Verify

- `pnpm typecheck`, `pnpm test`, `pnpm build` green.
- Live Playwright repro (`/tmp/opencode/repro_voice.py`, needs the user's
  `AZURE_VOICE_*` env + live DB): dashboard -> Start practice -> lobby checks
  green -> Begin -> Live connects, `session.updated` received, interviewer
  greeting observed, no handshake/config errors. Redact `api-key` from any
  pasted logs.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4135,"specSha256":"9600a248e860336e57577c00c51de8896580710ecc9a30bb1b48cc0c377ec72c","branch":"refs/heads/fix/voice-live-session-update","head":"14be9975dc17be2b0f05b422e67b32e0470a521b","baseRef":"refs/heads/main","baseCommit":"14be9975dc17be2b0f05b422e67b32e0470a521b","sourceTree":"391e82f73c2b65a97f1fb063c306c4efe192da58","absentOptional":[]} -->
