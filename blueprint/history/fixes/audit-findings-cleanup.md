# Fix: audit findings cleanup (F-01 to F-04)

**Type:** Fix
**Status:** `verified` (all 4 steps built; final gates: typecheck 0,
root 496/496 across 62 files, `tsc -b` clean)
**Branch:** `fix/audit-findings-cleanup`
**Fixes:** F-01, F-02, F-03, F-04

## The problem

Four open P2/P3 findings from the Sep 17 audit, all in the sandbox/docs area
the 17d slice left untouched:

- **F-01 (P2):** `docs/deployment.md:50-61` still describes the deleted
  `LocalCodeRunner` and the deleted `ALLOW_INSECURE_CODE_RUNNER` flag. An
  operator following it would set a nonexistent flag and misunderstand prod.
- **F-02 (P2):** `Value::quoted` in `packages/backend/src/cpp-harness.ts:95-106`
  escapes `\`, `"`, `\n`, `\r`, `\t` but passes `\b`, `\f`, and other C0
  controls through raw: invalid JSON. A candidate returning such a string
  turns the whole run into `error` instead of a per-case verdict, diverging
  from the JS (`JSON.stringify`) and Python (`json.dumps`) harnesses.
- **F-03 (P3):** the C++ JSON-lines parse in
  `packages/backend/src/docker-runner.ts:510-535` fails the whole run on the
  first non-JSON stdout line, so candidate debug prints behave differently
  than on JS/Python. User decision (current chat): implement tolerant parsing.
- **F-04 (P3):** per-run containers omit `--security-opt=no-new-privileges`:
  defense in depth at zero functional cost.

## The fix

- **Step 1 (F-01):** rewrite the `docs/deployment.md` "Code sandbox" section
  to describe the Docker runner (per-run `--network=none` containers,
  `SANDBOX_*` caps, image-pull requirement, socket mount, no-daemon means
  `error` runs). Historical audit docs under `docs/audit/` and
  `SESSION_HANDOFF.md` stay untouched.
  Done when the section names no deleted file or flag.
- **Step 2 (F-02):** escape every code point below U+0020 (except the
  already-handled `\n`, `\r`, `\t`) as `\uXXXX` in `quoted()`, mirroring
  `cEscape()` on the TS side. Add a unit case with `\x01`, `\b`, `\f`
  round-tripping through `buildCppMain` output parsing in
  `tests/cpp-harness.test.ts`.
  Done when the new case passes and the suite stays green.
- **Step 3 (F-03):** skip non-JSON stdout lines that do not parse, instead of
  failing the run; lines that parse as verdict rows keep the current
  handling (a debug line shaped exactly like a verdict row still collides,
  document that in a comment). Cover with a stubbed-spawn unit test in
  `tests/docker-runner.test.ts`: interleaved debug prints plus verdict rows
  produce per-case verdicts, not `error`.
  Done when the new test passes and crash output (no verdict rows at all)
  still reports `error` exactly as before.
- **Step 4 (F-04):** add `"--security-opt", "no-new-privileges"` in
  `buildRunArgs` and extend the existing `buildRunArgs` unit assertion.
  Done when the assertion passes and the suite stays green.

Must not break: JS/Python harness parity, the single-JSON protocol path
above the JSON-lines loop, compile-error reporting, existing sandbox tests.
No new abstraction, dependency, or config surface; each repair is the
finding's suggested fix.

## Verify

- `pnpm typecheck`, `pnpm test` (backend `cpp-harness` + `docker-runner`
  suites green with the new cases), `pnpm build`.
- Read the rewritten deployment section once for stale mentions.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3293,"specSha256":"9efca2c8c0dc4ab9c7477f93ee42ee6a7fbdf1fc5a9a68cb0faaa4a4b0b736e1","branch":"refs/heads/fix/audit-findings-cleanup","head":"748d9c4e4d34ccebe30ccb2119c18f9222eb0d29","baseRef":"refs/heads/main","baseCommit":"748d9c4e4d34ccebe30ccb2119c18f9222eb0d29","sourceTree":"ddef3dd2d17357931001a32eef2c3e6633c24001","absentOptional":[]} -->
