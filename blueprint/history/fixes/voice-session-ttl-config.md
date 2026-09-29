# Fix: Voice session TTL single source of truth

> **Generated file.** Holds the one fix being built right now. Run
> `/implement` to build it, `/complete` to archive it under
> `blueprint/history/fixes/` and reset this file.

- **Type:** Fix
- **Status:** verified
- **Branch:** fix/voice-session-ttl-config
- **Fixes:** F-11

## The problem

`VoiceConfig.ephemeralTtlSeconds` is populated by the validating `num()`
helper (`config.ts:144`, rejects non-finite/non-positive values) but nothing
reads it. `createVoiceSessionProviderFromEnv` (`voice-session.ts:113-115`)
re-reads `VOICE_EPHEMERAL_TTL_SECONDS` straight from env with bare
`Number(ttlRaw)`, so a garbage value (`"abc"`, `"0"`, `"-5"`) yields `NaN`
or a non-positive TTL and an invalid `expiresAt` on every minted session.
Both production call sites (`app.ts:373`, `server.ts:24`) invoke the
provider factory with no arguments, so the validated config value is dead
and the unvalidated parse is the live one. Two sources of truth where only
the unused one validates.

## The fix

Make the loaded config value the single source of truth: pass the already
validated `config.voice.ephemeralTtlSeconds` into the provider factory from
both call sites and delete the duplicate env re-parse in `voice-session.ts`.
Garbage TTL input then fails fast in `loadConfig` with `Invalid
VOICE_EPHEMERAL_TTL_SECONDS` instead of minting sessions with `NaN`
expiry. No new config surface, no behavior change for valid values
(default stays 600). Existing V3-5 production-guard behavior and its test
stay intact; the factory keeps its `(env)` parameter for the API-key checks.

## Build steps

- [x] 1. Thread validated TTL through the provider factory plus test.
  Done when `createVoiceSessionProviderFromEnv` takes no TTL parsing of its
  own, both call sites pass the loaded config value, `loadConfig` throws on
  garbage `VOICE_EPHEMERAL_TTL_SECONDS`, and a unit case pins the provider
  using the config value (e.g. custom TTL surfaces in `mint()` expiry).

## Verify

- `pnpm --filter @interview-coach/backend test` (or the repo test command)
  green, including the new TTL case and the existing V3-5 guard case.
- `pnpm typecheck` green.
- Manual: `VOICE_EPHEMERAL_TTL_SECONDS=abc pnpm --filter
  @interview-coach/backend start` fails fast with the `Invalid ...` error
  instead of booting.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2341,"specSha256":"027e26d486096d02ced637246dfb8187be74821d355531dff6cf601b436ddd73","branch":"refs/heads/fix/voice-session-ttl-config","head":"ab452121d141fe10eeb4201cf0a0e5b182378b9a","baseRef":"refs/heads/main","baseCommit":"ab452121d141fe10eeb4201cf0a0e5b182378b9a","sourceTree":"919c65527460923f0190f909444fd5f68b7b084a","absentOptional":[]} -->

## Completion

- Branch: fix/voice-session-ttl-config (head == base == main@ab45212 at archival). Fixes F-11.
- Changes: packages/backend/src/voice-session.ts - factory takes the validated ttlSeconds as a required parameter, duplicate Number() env parse deleted. packages/backend/src/app.ts and server.ts - both call sites pass config.voice.ephemeralTtlSeconds. packages/backend/tests/voice-session.test.ts - V3-5 calls updated for the new signature; new case pins the config TTL and the loadConfig fail-fast on garbage input.
- Gates: pnpm typecheck clean; voice-session file 13/13; full pnpm test 79 files / 1248 tests green; pnpm build (tsc -b) clean. No audit, independent review, check, or try guide selected (small non-sensitive P2 quality fix, backend-only, trust boundary untouched).
- Findings: F-11 marked fixed by /implement; F-01..F-07 stay fixed; F-08..F-10 and F-12..F-14 open; no P0 or P1 open or fixed. Nothing resolved, so no Findings section is archived and the ledger is preserved verbatim for a later /audit re-review.
- Note: the work commit also carries two pre-existing ride-along changes from before the branch was cut: the /overview regeneration of blueprint/context/project-overview.md (hash current) and the F-08..F-14 audit ledger additions in blueprint/context/findings.md. Both are disclosed here and unrelated to the TTL repair.
