# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P2] open - docs/deployment.md sandbox section describes the deleted local runner

**File:** docs/deployment.md:50-61
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** The live operator doc still says `LocalCodeRunner` executes candidate code in-process and refuses to run in production unless `ALLOW_INSECURE_CODE_RUNNER=true`. Both the file and the flag are deleted by this feature, and production now executes via the Docker runner. An operator following this section would set a nonexistent flag and misunderstand prod behavior. The spec required removing `ALLOW_INSECURE_CODE_RUNNER` docs mentions.
**Suggested fix:** Rewrite the section to describe the Docker runner (per-run `--network=none` containers, `SANDBOX_*` caps, image-pull requirement, socket mount, no-daemon means `error` runs). Historical audit docs under `docs/audit/` and the `SESSION_HANDOFF.md` history log stay untouched.
**Resolution:**

### F-02 [P2] open - C++ Value::quoted leaves C0 control characters unescaped, producing invalid JSON

**File:** packages/backend/src/cpp-harness.ts:95-106
**Found:** 2026-09-17 by /audit (scope: current; lens: tests)
**Why it matters:** `quoted()` escapes `\\`, `"`, `\n`, `\r`, `\t` but passes `\b`, `\f`, and other C0 controls (e.g. `\x01`) through raw, which is invalid JSON. A candidate returning such a string (or an `e.what()` message containing one) makes the whole run parse as `error` ("Harness emitted non-JSON output") instead of a per-case verdict. The JS harness (`JSON.stringify`) and Python harness (`json.dumps`) both escape these correctly, so C++ verdicts diverge from the other languages on reachable inputs.
**Suggested fix:** Escape every code point below U+0020 (except the already-handled `\n`, `\r`, `\t`) as `\uXXXX` in `quoted()`, mirroring `cEscape()` on the TS side. Add a unit case with `\x01`, `\b`, `\f` round-tripping through `buildCppMain` output parsing.
**Resolution:**

### F-03 [P3] open - C++ JSON-lines parsing fails the whole run on any extra stdout line

**File:** packages/backend/src/docker-runner.ts:510-535
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** Candidate C++ code that prints debug output to stdout interleaves non-JSON lines with verdict lines, and the first such line turns the entire run into an `error` outcome. The JS/Python single-JSON protocol reads the last line and tolerates extra output, so the languages behave inconsistently for the same debugging habit.
**Suggested fix:** None required for the current contract (submissions define `solve`; stdout printing is unspecified). If taken up, skip non-JSON lines that do not collide with verdict rows rather than failing the run, and cover it with a stubbed-spawn unit test.
**Resolution:**

### F-04 [P3] open - Per-run containers omit --security-opt=no-new-privileges

**File:** packages/backend/src/docker-runner.ts:241-270
**Found:** 2026-09-17 by /audit (scope: current; lens: security)
**Why it matters:** Defense in depth on the new security boundary. The flags already drop all capabilities, use a read-only rootfs, `--user 65534:65534`, and `--network=none`, so the residual risk is low; `no-new-privileges` would additionally block setuid/setgid privilege escalation inside the container at zero functional cost.
**Suggested fix:** Add `"--security-opt", "no-new-privileges"` in `buildRunArgs` and extend the `buildRunArgs` unit assertion.
**Resolution:**
