# Feature: Recommendation prompt migration

**From build-plan:** feature 27
**Build attempt:** 1
**Branch:** `feature/recommendation-prompt-migration`
**Status:** verified

## Goal

Move the static system prompt in `apps/api/src/recommendation-model.ts` to a
Markdown fragment + JSON assembly manifest, reusing the `loadPromptSet` loader
from feature 23. Keep the recommendation parser, deterministic candidate-set
assembly, and unconfigured fallback behavior unchanged: the system message
must be byte-identical.

## In scope

- New prompt directory `apps/api/src/prompts/recommendation/` with
  `manifest.json` (`version: 1`, one `recommendation-system` entry, no vars)
  plus `system.md` holding the current 8-line `SYSTEM_PROMPT` verbatim.
- `recommendation-model.ts` loads the prompt once at module scope via
  `loadPromptSet` resolved from `import.meta.url` (same idiom as features
  24/25; works under tsx-on-source dev/vitest/prod Docker which COPYs all of
  `apps/api/src`; no build-copy step). `buildRecommendationMessages` keeps its
  signature and byte-identical output; the user message stays code-built JSON.
- Fail closed (let loader errors throw; `noUncheckedIndexedAccess`-safe entry
  access).
- Strict-equality lock test on the system message in
  `recommendation-model.test.ts`.

## Out of scope

- Parser changes (`parseRecommendationProposal`), transport changes,
  `UnconfiguredRecommendationModel` fallback behavior, service/route changes.
- Shared cross-directory fragments; loader changes.
- V2 items (no behavior change here regardless).

## Build loop

`workflow.stepReview` is `feature`: implement all steps, then present one
review packet. `checkpointCommits` is disabled. Gates are manual: `pnpm
typecheck` and `pnpm test` (no Verify command declared). `/complete` creates
the final feature commit.

## Build steps

- [x] 1. Add `apps/api/src/prompts/recommendation/manifest.json`
  (`{"version": 1, "prompts": {"recommendation-system": {"parts":
  ["system.md"]}}}`) plus `system.md` with the 8-line prompt verbatim, no
  trailing newline (loader reads raw bytes; parts join with `"\n"`).
  - Done when: manifest validates against the loader schema and `system.md`
    bytes equal the current `SYSTEM_PROMPT` lines joined with `"\n"`.
- [x] 2. Rewire `recommendation-model.ts`: replace the `SYSTEM_PROMPT` literal
  with the module-scope `loadPromptSet` load (fail-closed throw on missing
  entry). Update the module header History with `27`.
  - Done when: `pnpm typecheck` passes and `buildRecommendationMessages`
    signature is unchanged.
- [x] 3. Add a lock test in `recommendation-model.test.ts` next to the
  existing prompt test: `EXPECTED_SYSTEM_PROMPT` strict equality (`toBe`) on
  `messages[0].content` for the existing fixture input. Keep existing
  `toContain` tests untouched.
  - Done when: focused recommendation tests pass and the expected string is
    verified byte-identical against pre-change output.
- [x] 4. Run `pnpm typecheck` and the full `pnpm test` suite.
  - Done when: typecheck clean and full suite green with no regressions.

## Files / areas

- `apps/api/src/prompts/recommendation/manifest.json` (new)
- `apps/api/src/prompts/recommendation/system.md` (new)
- `apps/api/src/recommendation-model.ts` (`SYSTEM_PROMPT` removal, loader
  wiring; parser, adapter, factory untouched)
- `apps/api/tests/recommendation-model.test.ts` (lock test only)

## Data / contracts

- Manifest shape per the feature-23 loader schema; `requiredVars` omitted
  (defaults to `[]`), load called with `{}`.
- Observable contract: `buildRecommendationMessages(input)[0]` equals
  `{ role: "system", content: <today's 8 lines joined with "\n"> }` for every
  input; candidate-set user message assembly unchanged.

## Testing

- `pnpm typecheck` (`tsc --noEmit`).
- Focused: `pnpm vitest run --project unit
  apps/api/tests/recommendation-model.test.ts`, then full `pnpm test`.
- Lock test: full-content `toBe` on the system message; existing parser and
  adapter tests (fake transport) stay as regression cover.

## Notes for the AI

- Follow features 24/25 conventions: prompt dir resolved from `import.meta.url`,
  no em dashes, pnpm-only.
- The prompt contains double quotes and a JSON shape line; keep them verbatim
  in `system.md` (no escaping needed in Markdown).
- Do not touch the unconfigured fallback: it returns data, not exceptions, and
  is out of scope.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4412,"specSha256":"506e0c5b6b4100b3baa7092706fa21c7a6de83c7e32c6aedd04f47bd78384430","branch":"refs/heads/feature/recommendation-prompt-migration","head":"43348f74d6241947408018078e8f73ce6e847de9","baseRef":"refs/heads/main","baseCommit":"43348f74d6241947408018078e8f73ce6e847de9","sourceTree":"1650d6b957584e8dccb541900be5ec43b044459a","absentOptional":[]} -->
