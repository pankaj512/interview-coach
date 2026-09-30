# Fix: Remove dead client and domain code

**Type:** Fix
**Status:** verified
**Branch:** fix/remove-dead-client-and-domain-code
**Fixes:** F-09, F-10

## The problem

F-09: `AnswerForm` (components/AnswerForm.tsx:12), `HintPanel`
(components/HintPanel.tsx:22), and `ProgressChecklist`
(ds/primitives.tsx:331) are exported but never imported anywhere — leftovers
from the retired manual-answer / text-mode path. Verified: each name occurs
only at its own definition, and `components/` has no barrel re-exports.

F-10: these domain exports have no callers in source or tests (verified: each
name occurs only at its own definition):
`result.ts` (`isOk`, `mapResult`, `andThen`), `tool-service.ts`
(`isCanonicalToolName`, `isDeprecatedToolAlias`), `evaluation-job.ts`
(`isEvaluationJobStatus`), `hints.ts` (`MIN_HINT_LEVEL`), `curriculum.ts`
(`curriculumIdForInterviewType`), `skill-update.ts` (`isSkillDecision`),
`submission-service.ts` (`parseTestCasesForRun`, `parseLimitsForRun`),
`ids.ts` (`asResponseId`, `asEventId`, `asMessageId`, `asEvaluationJobId`).
The domain barrel (`index.ts`) is `export *`, so deletion needs no barrel
edits. Must stay: `isErr`, `ok`, `err`, and the other branded-ID helpers
that have callers.

## The fix

Pure deletion, no behavior change. Delete the two dead component files and
the `ProgressChecklist` export; delete the listed unused domain exports.
Re-add any of them when a real caller appears.

## Build steps

1. [x] Delete `AnswerForm.tsx` and `HintPanel.tsx`, remove the
   `ProgressChecklist` export from `ds/primitives.tsx`.
   - Done when: the three names occur nowhere under
     `packages/web-client/`, and the web-client typecheck passes.
2. [x] Delete the F-10 unused exports from the eight domain files.
   - Done when: the listed names occur nowhere under `packages/`
     (except this spec/history), `isErr`/`ok`/`err` and the used branded-ID
     helpers remain, and repo typecheck passes.

## Verify

- `pnpm --filter @interview-coach/web-client typecheck`, repo `pnpm
  typecheck`, `pnpm test`, and `pnpm build` all green with no test changes.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2101,"specSha256":"12727d49e9f336bd918ebe5479a1c79d0741ef8c57e7566706b1564c506f4c3f","branch":"refs/heads/fix/remove-dead-client-and-domain-code","head":"2723792baa37e483db280765595202884c59e76d","baseRef":"refs/heads/main","baseCommit":"2723792baa37e483db280765595202884c59e76d","sourceTree":"ff3a97190995ef8854af05790469907f292637ac","absentOptional":[]} -->

## Completion

- Branch: fix/remove-dead-client-and-domain-code (head == base == main@2723792 at archival). Fixes F-09, F-10.
- Changes: packages/web-client/src/components/AnswerForm.tsx and HintPanel.tsx deleted (81 + 84 lines); ProgressChecklist export removed from ds/primitives.tsx (ProgressState/ProgressItem stay, still used). Eight domain files: isOk/mapResult/andThen (result.ts), isCanonicalToolName/isDeprecatedToolAlias (tool-service.ts), isEvaluationJobStatus (evaluation-job.ts), MIN_HINT_LEVEL (hints.ts), curriculumIdForInterviewType (curriculum.ts), isSkillDecision (skill-update.ts), parseTestCasesForRun/parseLimitsForRun (submission-service.ts), asResponseId/asEventId/asMessageId/asEvaluationJobId (ids.ts) deleted. isErr/ok/err and used branded-ID helpers remain. Net -249 lines, pure deletion, zero test changes.
- Gates: web-client typecheck clean; repo typecheck clean; full pnpm test 79 files / 1248 tests green; pnpm build (tsc -b) clean. No audit, independent review, check, or try guide selected (small non-sensitive P2/P3 dead-code removal, trust boundary untouched).
- Findings: F-09, F-10 marked fixed by /implement; F-08, F-11 stay fixed; F-12..F-14 open; no P0 or P1 open or fixed. Nothing resolved, so no Findings section is archived and the ledger is preserved verbatim for a later /audit re-review.
