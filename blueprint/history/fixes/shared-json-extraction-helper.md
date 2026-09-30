# Fix: Shared JSON extraction helper

**Type:** Fix
**Status:** verified
**Branch:** fix/shared-json-extraction-helper
**Fixes:** F-08

## The problem

`parseRecommendationProposal` (recommendation-model.ts:91-113),
`parseEvaluationProposal` (evaluation-model.ts:86-110), and
`parseSubmitVerdictProposal` (submit-verdict-model.ts:70-92) each inline the
same ~20-line brace-depth scanner that finds the first `{`, tracks nesting to
the matching `}`, slices the substring, and `JSON.parse`s it. A correctness
fix to the scanner must be applied in three places or the parsers diverge.
All three files already import from `./llm-transport.js`.

## The fix

Add one exported `extractFirstJsonObject(content: string): string | null` to
`packages/backend/src/llm-transport.ts` implementing the scanner exactly once
(same semantics: first `{`, brace-depth match, `null` when absent or
unbalanced; no behavior change, including the current no-string-tracking
behavior). Have each of the three parsers call it and keep only their own
`JSON.parse` + contract validation. Must not break: existing parser tests in
`packages/backend/tests/` (recommendation-model, evaluation-model,
submit-verdict-model) keep passing unchanged.

## Build steps

1. [x] Add `extractFirstJsonObject` to `llm-transport.ts` and rewire the three
   parsers to call it.
   - Done when: no brace-scanning loop remains in the three model files, and
     `pnpm --filter @interview-coach/backend typecheck` passes.

## Verify

- `pnpm --filter @interview-coach/backend test` (or repo `pnpm test`): all
  existing parser cases pass, including the fenced-code, surrounding-prose,
  no-JSON, and incomplete-object cases.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":1677,"specSha256":"b78bdf2e5a47133b8422d7eba88506bf80c4a2c4faa96eaccc26f06d1a5cd12a","branch":"refs/heads/fix/shared-json-extraction-helper","head":"2723792baa37e483db280765595202884c59e76d","baseRef":"refs/heads/main","baseCommit":"2723792baa37e483db280765595202884c59e76d","sourceTree":"6f3729dee10a8a973c4338a4a4acc67ce252b125","absentOptional":[]} -->

## Completion

- Branch: fix/shared-json-extraction-helper (head == base == main@2723792 at archival). Fixes F-08.
- Changes: packages/backend/src/llm-transport.ts - new exported extractFirstJsonObject(content): string | null implementing the brace-depth scanner once (same semantics, no behavior change). packages/backend/src/recommendation-model.ts, evaluation-model.ts, submit-verdict-model.ts - inline ~20-line scanners replaced with a call to the helper; each keeps its own JSON.parse + contract validation; import lists extended by one line.
- Gates: pnpm typecheck clean; focused parser suites 22/22; full pnpm test 79 files / 1248 tests green; pnpm build (tsc -b) clean. No audit, independent review, check, or try guide selected (small non-sensitive P2 quality refactor, backend-only, trust boundary untouched).
- Findings: F-08 marked fixed by /implement; F-11 stays fixed; F-09, F-10, F-12..F-14 open; no P0 or P1 open or fixed. Nothing resolved, so no Findings section is archived and the ledger is preserved verbatim for a later /audit re-review.
