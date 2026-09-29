# Fix: Wire shape runners into the run path

**Type:** Fix
**Status:** verified
**Branch:** `fix/wire-shape-runners-into-run-path`

## The problem

Test on a C++ interview always reports "error — no cases executed" with zero rows (`/debug` Confirmed, 2026-09-29, Majority Element `iv_3da6e6a2`). `DockerCodeRunner.writeFiles` (`docker-runner.ts:360-390`) still uses the legacy per-language harnesses, which demand a free function named `solve` — but every seeded starter is LeetCode-style (`class Solution::majorityElement`, `var majorityElement = …`, `class Solution.m …`), so compilation/load always fails and `assembleErrorRun` persists an empty `error` run (all 5 `code_runs` ever recorded are `cpp`/`error` with `results: []`). The correct machinery exists but is production-dead: `assembleCppRun` (+ JS/Python siblings) and per-problem `runner_links` are exercised only in `*-runners.test.ts`; `CodeExecutor.execute(submission, testCases, limits)` takes no problem context so it can never reach them. Secondary gap, verified in code: executor-level error text (compile/load failures) is dropped by `assembleRun` whenever the outcome carries zero rows — while per-result `error` already flows end to end (`serializeRun`, client `SerializedTestResult`, room table). So the room's "see the error above" points at nothing.

## The fix

Plumb the submission problem's runner link for the submission language from `SubmissionService.runTests` through to `DockerCodeRunner.execute` (optional param on the `CodeExecutor` interface; route resolves `submission.problemId` via the problems repo). When a link is present, the run assembles with the matching `assemble*Run` (runner/nodes sources loaded from `shape-runners/<lang>/`, samples derived from the run's test cases); when absent — including submissions with no `problemId` — keep the exact legacy harness behavior. Map zero-row executor error/timeout outcomes to per-case error rows inside domain `assembleRun` (single point covering `fail()`, parse errors, load errors, and timeouts — all of which return `results: []`), so compile/load text renders in the existing per-row error UI; no serializer/client change. No new abstraction beyond a small runner-source loader; no sandbox-flag, timeout, or verdict-flow change. Must not break: legacy no-problem runs, JS/Python current behavior where links are absent, starter prefill, Submit verdict flow.

## Build steps

- [x] 1. C++ wiring: link plumbing + `assembleCppRun` in the C++ branch + stubbed-spawn test proving the assembled main instantiates the class entry (Majority Element shape).
  Done when a stubbed Docker run of class-style C++ code returns per-case results instead of an empty error run.
- [x] 2. Same wiring for JavaScript and Python via their `assemble*Run`, with matching stubbed-spawn tests.
  Done when all three languages assemble through their shape runners when a link is present and fall back to legacy harnesses otherwise.
- [x] 3. Surface executor errors as per-case rows (domain `assembleRun` maps zero-row error/timeout outcomes onto the run's test cases with the outcome message) + final gates.
  Done when a failing run shows its compile/load error text in the room table, and `pnpm typecheck`, full `pnpm test`, and the web-client build pass.
- [x] 4. Run ALL problem examples as sample cases and display the input plainly: replace `sampleCaseFor` with `sampleCasesFor` (one `TestCaseInput` per example, named `sample 1`, `sample 2`, … to match the problem pane labels), send the whole array in `testCode`, pair rows per-sample in `sampleResultRows`, and render a single-string `args` unwrapped (so `nums = [3,2,3]` shows as itself, not `["nums = [3,2,3]"]`). Backend needs no change (samples already pair test cases to examples by index and round-trip `t.name`).
  Done when Majority Element Test runs 2 cases with plain inputs, and `pnpm typecheck`, the client suite, and the web-client build pass.
- [x] 5. Preserve line breaks in the sample table: `white-space: pre-wrap` on the case-table cells so multi-line inputs render line-per-line (long lines still wrap via the existing `overflow-wrap`).
  Done when a multi-line sample input displays with its line breaks intact.

## Verify

- `pnpm typecheck`, `pnpm test`, web-client build.
- Live Docker try (needs daemon + `gcc:14-bookworm`, both present on dev): C++ Majority Element Test returns a passing per-case row; a deliberately broken submission shows its compile error in the room instead of a bare `0/0`.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4519,"specSha256":"ad803ee2fc57f1baf769c22022b62a1dd1c7cace39239f192d02d7a56fcbeced","branch":"refs/heads/fix/wire-shape-runners-into-run-path","head":"653ceeb721c2a6568a4e421413d677f70a6abc1d","baseRef":"refs/heads/main","baseCommit":"653ceeb721c2a6568a4e421413d677f70a6abc1d","sourceTree":"bc0e5d1b1150880752c527fc7cbcba2462fbbbd1","absentOptional":[]} -->

## Completion record

- Step 1 (C++): `RunProblemContext` plumbing route -> `runTests` -> `CodeExecutor.execute` (optional 4th param); `writeAssembledCpp` loads `shape-runners/cpp/` sources, pairs test cases to examples by index, resolves method-sequence dispatch by problemId / shape meta by runnerId, falls back to the legacy harness when no link. Stubbed-spawn tests: linked Majority Element run + missing-sample error.
- Step 2 (JS/Python): `writeAssembledJs`/`writeAssembledPython` via their `assemble*Run` + `cases.json` raw-input pairing; stubbed-spawn tests on shape-001 for both.
- Step 3 (error surfacing): domain `assembleRun` maps zero-row error/timeout outcomes with a message onto per-case failed rows (single point covering `fail()`, parse/load errors, timeouts); 2 pinning tests in `sandbox.test.ts`. No serializer/client change needed — per-result error already flows end to end.
- Step 4 (all samples + plain input): `sampleCaseFor` -> `sampleCasesFor` (one case per example, `sample 1`, `sample 2`, …), whole array sent in `testCode`, per-sample pairing in `sampleResultRows`, new `formatCaseInput` unwraps a lone string arg. Backend untouched (index pairing + name round-trip already hold).
- Step 5 (multi-line display): `white-space: pre-wrap` on `.case-table td`.
- Gates: `pnpm typecheck` clean, full `pnpm test` 77 files/1240 green (after final logic edits; only CSS + markdown changed after, covered by re-run typecheck + 8GB vite build ok).
- Live proof: user Try on C++ Majority Element — `1 passed of 1 in 2029ms` with actual 3, then reported the 1-of-2-samples and input-format defects (fixed in steps 4-5, pending user re-try). No backend restart needed for steps 4-5 (client-only).
- Findings/review: nothing resolved, no review — ledger (F-01..F-04 fixed P2/P3, F-05 P2 + F-06/F-07 P3 open, no P0/P1) and review stub left intact.
