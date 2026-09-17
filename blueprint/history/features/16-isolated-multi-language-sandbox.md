# Feature: Isolated multi-language sandbox

**From build-plan:** feature 16
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/isolated-multi-language-sandbox`

## Goal

Replace the local JS/Python runner with properly isolated code execution
for C++/JS/Python behind the existing sandbox routes, and retire
`LocalCodeRunner` on security grounds. Route contracts, verdict shapes,
and the item 17 Test-button wiring stay unchanged; only the executor
behind the `CodeExecutor` port changes, plus C++ joins the language set.

## Design reference

None (no visual work). The isolation model follows the flags the
codebase already names: per-run `docker run --network=none` with
CPU/memory/pids caps (see `packages/backend/src/code-runner.ts`
isolation-honesty header, which this feature retires).

## In scope

- New `DockerCodeRunner` implementing the domain `CodeExecutor` port:
  per-run container with `--network=none`, `--memory`, `--cpus`,
  `--pids-limit`, `--read-only` rootfs with a tmpfs scratch dir, the
  submission mounted read-only, unprivileged user, scrubbed environment
  (keep the existing allowlist approach: nothing secret-bearing reaches
  the child). Wall-clock kill of the Docker CLI child preserves current
  `timeoutMs` semantics; output caps and hidden-actual masking stay as-is.
- C++ support end to end: extend the domain `CodeLanguage` union and
  validation (`CODE_LANGUAGES` gains `"cpp"`, `createSubmission` accepts
  it), and the backend compiles (`g++ -std=c++17 -O2`) then runs under the same Docker
  isolation. Candidate contract mirrors the other languages: the
  submission defines a `solve` function; the backend generates a `main.cpp`
  embedding the cases as C++ literals via a small serializer
  (null/bool/number/string/array/object; shortest-round-trip doubles,
  C-escaped strings). Compile failures become persisted `error` runs with
  truncated messages, consistent with load-error handling.
- Retirement: delete `packages/backend/src/code-runner.ts` and its
  `ALLOW_INSECURE_CODE_RUNNER` escape hatch with it. The Docker runner
  works wherever a daemon exists, so no prod bypass is needed; without a
  daemon, runs persist as `error` runs (routes keep their 201-never-5xx
  verdict contract).
- Wiring: `app.ts` sandbox setup uses the Docker runner; the
  `deps.codeRunner` fake seam stays for tests.
- Config + docs: new `SANDBOX_*` env (images, memory/cpu/pids caps)
  with sane defaults in `.env.example`; image pulls (`gcc`, `node`,
  `python` images) documented as a runtime requirement next to the
  existing Docker-for-Postgres requirement.
- Tests: unit tests for the C++ literal serializer and Docker arg
  building / output parsing (no daemon needed); live Docker integration
  tests for pass/fail/timeout/compile-error per language that
  skip-with-warning when no daemon is reachable (repo warn-and-pass
  precedent). Existing sandbox suites keep passing against the new runner.

## Out of scope

- Items 17-19 and V2 work. No client changes (S7b run panel and the item
  17 Test button ride the unchanged routes); no new routes or verdict
  shapes; no problem statements/samples/boilerplate (item 18).
- Full container orchestration / production hardening beyond per-run
  `docker run` flags (still V2 per the overview usage model).
- New npm dependencies (stdlib `child_process` drives the Docker CLI).

## Build loop

One review packet at the end (`workflow.stepReview: "feature"`).
No checkpoint commits (`workflow.checkpointCommits: "disabled"`).
No `Verify` command is declared, so the gates are the project's real commands:
`pnpm typecheck` then `pnpm test` (live `*_test` DB when available, else the
suite's warn-and-pass path), plus `pnpm build`.

## Build steps

- [x] 1. Domain C++ support. Extend `CodeLanguage`/`CODE_LANGUAGES` with
  `"cpp"`, update `createSubmission` validation + message, add the C++
  literal serializer with focused unit tests (escaping, nesting,
  doubles, truncation boundaries).
  Done when domain sandbox tests pass including the new serializer cases.
- [x] 2. Docker executor. Add the runner (harness per language, `main.cpp`
  generation for C++, arg building with the exact isolation flags, output
  parsing reusing current verdict shapes) with unit tests that stub the
  child process (no daemon needed).
  Done when the exact `docker run` flags are asserted and
  pass/fail/timeout/load-error map to current `ExecutorOutcome` shapes.
- [x] 3. Retire the local runner. Delete `code-runner.ts`, wire the Docker
  runner in `app.ts`, remove `ALLOW_INSECURE_CODE_RUNNER` references
  (code + `.env.example` + docs mentions).
  Done when no reference to `LocalCodeRunner`/`ALLOW_INSECURE` remains
  and `tsc` is clean.
- [x] 4. Live integration tests. Docker-backed pass/fail/timeout/
  compile-error coverage per language, skipping with a warning when no
  daemon is reachable.
  Done when the suite is green with a daemon and green-with-skips
  without one.
- [x] 5. Config + docs. `SANDBOX_*` env with defaults, `.env.example`
  entries, image-pull requirement documented, runner header docs updated.
  Done when a fresh checkout documents every new variable and image.
- [x] 6. Final gates. Run `pnpm typecheck`, `pnpm test`, `pnpm build`,
  all green in one clean run.
  Done when all three pass.

## Files / areas

- `packages/domain/src/submission.ts` (language union + validation)
- `packages/backend/src/` new Docker runner + C++ serializer (kebab-case
  per concern, e.g. `docker-runner.ts`, `cpp-harness.ts`)
- `packages/backend/src/app.ts` (sandbox wiring only)
- `packages/backend/src/code-runner.ts` (deleted)
- `packages/backend/tests/` (sandbox suite), `packages/domain/tests/`
  (serializer + language cases)
- `.env.example` (new `SANDBOX_*` vars)

## Data / contracts

- Route shapes, verdict codes (201-never-5xx), `RunLimits`
  (100ms..30s, 5s default), test-case bounds (1..50), code cap (<=50k),
  hidden-actual masking: all unchanged.
- New candidate contract: C++ submissions define `solve`; compile errors
  are `error` runs (message truncated like load errors).
- New operator contract: Docker daemon + image pulls required;
  `SANDBOX_*` caps documented; no-daemon means `error` runs, never 5xx.

## Testing

- Vitest per repo standard; fakes for the `CodeExecutor` seam preserved.
- Unit tests (no daemon): serializer, flag building, output parsing.
- Integration tests (daemon or skip-with-warning): one
  pass/fail/timeout/compile-error matrix per language.
- `pnpm typecheck` is the lint gate and must exit 0.

## Notes for the AI

- Candidate code is untrusted input: this is the security boundary.
  Never mount the submission writable, never pass host env through,
  never add `--privileged`, and keep `--network=none` unconditional.
- Keep the diff off the client entirely; item 17 owns the Test button.
- If Docker is unavailable in the build environment, unit tests plus
  skip-with-warning integration tests still prove everything except live
  execution; say so in the review packet.

## Open questions

- None. Daemon-absent behavior (skip-with-warning tests, `error` runs)
  follows the repo's existing warn-and-pass precedent.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":7180,"specSha256":"77e8853be89a543363523bbccf2db4d195e5b8a20c7265e6632e538721dd905d","branch":"refs/heads/feature/isolated-multi-language-sandbox","head":"2220059595364ec70b1adbe65c246516b6c4d9eb","baseRef":"refs/heads/main","baseCommit":"64f45ab60dd3e06be5c71f1ebe96251844aee2cb","sourceTree":"20eddd95478ef38c3d3da2989e9d2743e9f92e87","absentOptional":[]} -->
## Independent review

**Status:** passed
**Target commit:** 2220059595364ec70b1adbe65c246516b6c4d9eb
**Base commit:** 64f45ab60dd3e06be5c71f1ebe96251844aee2cb
**Base ref:** refs/heads/main
**Spec hash:** 77e8853be89a543363523bbccf2db4d195e5b8a20c7265e6632e538721dd905d
**Prepared by:** opencode
**Builder model:** opencode/muse-spark-1.3-contributor-free
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-17T12:21:35Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** unknown (runtime did not expose exact model)
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-17T12:25:12Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `pnpm typecheck`: pass (clean, no output)
- `pnpm test`: pass (60 files, 464 tests, 0 failures; live Docker integration tests executed against a reachable daemon with cached node:24-slim and gcc:14-bookworm images)
- `pnpm build`: pass (`tsc -b` clean)

## Evidence

- `packages/backend/tests/sandbox.test.ts` (19 tests): live `sandbox runs (docker runner)` passes for correct JS/Python, infinite loops report `timeout`, C++ passes and compile errors report `error` runs, no-daemon runner fails closed as `error` with 201 verdicts
- `packages/backend/tests/docker-runner.test.ts`: exact `docker run` flag array asserted (`--network=none`, memory/cpu/pids caps, `--cap-drop=ALL`, `--read-only`, tmpfs `/tmp`, user 65534:65534, read-only `/work` mount, scrubbed env of HOME/TMPDIR/NODE_OPTIONS only); timeout kill+`rm -f` sequence, daemon-down fail-closed, output caps, lazy image-pull-once verified with stubbed spawn
- `packages/backend/tests/cpp-harness.test.ts` (8 tests) + domain sandbox tests: `cppLiteral`/`cEscape` scalars, nesting, non-finite markers, `buildCppMain` case-name quoting
- Isolation flags re-verified by direct read of `buildRunArgs` (docker-runner.ts:241-270); executor throws remain 201-safe via the `try/catch` + `assembleErrorRun` path in `packages/domain/src/submission-service.ts:206-227`; concurrency quota and hidden-actual masking unchanged in the service/domain layers
- Retirement verified: no `LocalCodeRunner`/`ALLOW_INSECURE_CODE_RUNNER` references remain in product code, config, or `.env.example` (only historical `docs/audit/*` records, the `SESSION_HANDOFF.md` history log, a naming example in coding-standards, and the unrelated `ALLOW_INSECURE_VOICE_API_KEY` flag)
- Freshness validated at review time: `HEAD` equals target, merge base via `refs/heads/main` equals base, spec SHA-256 matches, working tree differs from target only via this receipt file

## Findings

- F-01 [P2] docs/deployment.md sandbox section describes the deleted local runner
- F-02 [P2] C++ Value::quoted leaves C0 control characters unescaped, producing invalid JSON
- F-03 [P3] C++ JSON-lines parsing fails the whole run on any extra stdout line
- F-04 [P3] Per-run containers omit --security-opt=no-new-privileges

## Remaining risk

- `/check` was not required (`Check result: not-required`); no live route walkthrough performed beyond the automated suites
- Live-DB persistence tests not separately exercised in this session (no `TEST_DATABASE_URL`; the suite's warn-and-pass path applies, unchanged by this delta)
- Backend production image build (Dockerfile Docker-CLI download layer) and compose boot probe not run here; CI covers both
- No browser/client verification (no client files in the delta; item 17 owns the Test-button surface)
- Per-run container overhead (image ensure, create/logs/wait/rm round-trips) and wall-clock budget excluding daemon-side latency are accepted as designed; `maxConcurrentRuns` quota remains the backpressure mechanism
