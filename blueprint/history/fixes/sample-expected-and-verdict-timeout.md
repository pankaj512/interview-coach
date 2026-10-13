# Fix: sample-case expected mismatch and verdict timeout resilience

**Type:** Fix
**Status:** verified
**Branch:** `fix/sample-expected-and-verdict-timeout`

## The problem

Two issues were reproduced in a live interview flow:

1. Sample tests can show visually similar expected/actual values but still fail.
   For `prob_remove-duplicates-from-sorted-array`, DB examples use LeetCode
   in-place text outputs (for example `"2, nums = [1,2,_]"`), while runner
   actuals are scalar numbers (`2`, `5`). The run comparator is strict and
   backend-owned, so this mismatched expected shape causes false-looking fails.
2. `Submit for Review` can fail with timeout under default verdict-model limits
   (`LLM_TIMEOUT_MS=10000`, `LLM_MAX_RETRIES=2`), producing a user-visible
   timeout path.

## The fix

- Normalize only the known LeetCode in-place sample-output shape used by this
  problem when building sample cases in the web client: if an example output
  starts with `<number>, nums = ...`, use that leading number as the expected
  value for sample runs.
- Raise verdict model default timeout to a more realistic baseline for review
  calls while preserving environment overrides.
- Keep strict backend comparison logic unchanged; this fix adjusts input shape
  and timeout defaults, not judge semantics.

## Build steps

- [x] Step 1 - Sample expected normalization for in-place output text.
  Done when remove-duplicates sample cases submit numeric expected values
  (`2`, `5`) instead of raw `"k, nums = ..."` strings, and targeted tests cover
  the normalization plus no-regression for normal outputs.
- [x] Step 2 - Verdict timeout default adjustment.
  Done when verdict-model timeout default is increased in API config, existing
  env overrides still win, and targeted tests pass.

## Verify

- `pnpm --filter @interview-coach/web typecheck`
- `pnpm --filter @interview-coach/web test`
- `pnpm --filter @interview-coach/api test`
- `pnpm test`
- Manual check: in a live room on remove-duplicates, sample tests no longer
  fail from `"k, nums = ..."` formatting mismatch; `Submit for Review` no longer
  times out under ordinary response latency.

<!-- blueprint:completion {"schemaVersion":1,"specBytes":2157,"specSha256":"5b4d278e6cdaa5e53e1ad3ec49a62b0cd780fcdd4e1c2ecc55319e0d3cd25311","branch":"refs/heads/fix/sample-expected-and-verdict-timeout","head":"ea7414eefcee36189aa5a72b10f070ed6aebc5db","baseRef":"refs/heads/main","baseCommit":"ea7414eefcee36189aa5a72b10f070ed6aebc5db","sourceTree":"b7436b53bb467d2c6b1d8388af1b0b478861408a","absentOptional":[]} -->

## What changed

- `apps/web/src/components/CodeWorkspace.tsx`: added a narrow normalization for LeetCode in-place sample outputs. When sample output matches `^\s*(\d+)\s*,\s*nums\s*=`, expected becomes that leading number; all other outputs keep existing `tryJson` behavior.
- `apps/web/tests/code-workspace.test.ts`: added focused coverage for both branches (in-place normalization to number and non-matching strings unchanged).
- `apps/api/src/config.ts`: raised default `LLM_TIMEOUT_MS` fallback from `10000` to `20000` while preserving env override behavior.
- `apps/api/tests/hardening.test.ts`: added config test asserting default timeout/retries and env override precedence.

## Verification evidence

- `pnpm --filter @interview-coach/web typecheck`: clean.
- `pnpm --filter @interview-coach/web test`: clean.
- `pnpm exec vitest run --project unit apps/api/tests/hardening.test.ts`: clean.
- `pnpm build` (`tsc -b`): clean.
- `pnpm test`: 79 files / 1259 tests passed.

## Manual try path

- Start a live interview on Remove Duplicates from Sorted Array.
- Run sample tests with a correct in-place solution and verify sample 1/2 can pass (expected values no longer treated as raw `"k, nums = ..."` strings).
- Submit for review and verify timeout behavior is improved under normal model latency; env vars still control timeout/retry tuning.

## Completion

- **Completed:** 2026-10-13 via `/complete` on branch `fix/sample-expected-and-verdict-timeout` (head == base == main@ea7414e at archival).
- **Changes:** sample expected-value normalization for the known LeetCode in-place output shape, plus a higher default verdict timeout baseline with override behavior unchanged.
