# Feature: Voice-session instruction migration

**From build-plan:** feature 26
**Build attempt:** 1
**Branch:** `feature/voice-session-instruction-migration`
**Status:** verified

## Goal

Move the `buildSessionInstructions` content in `apps/api/src/voice-session.ts`
to Markdown fragments + JSON assembly manifest, reusing the `loadPromptSet`
loader from feature 23. Preserve dynamic session interpolation and keep the
route payload shape unchanged: the mint response `instructions` string must be
byte-identical to today for every input combination.

## In scope

- New prompt directory `apps/api/src/prompts/voice-session/` with
  `manifest.json` plus one Markdown fragment per instruction line-group (base
  block plus one file per conditional line; all static text moves to files,
  presence/ordering logic stays in code since the loader has no conditionals).
- `buildSessionInstructions` loads the prompt set per call with caller-supplied
  vars (vars differ per mint, so module-scope loading like features 24/25 is
  not possible) and assembles lines in the current fixed order with the current
  presence conditions.
- `{{candidateId}}` / `{{interviewId}}` interpolation inside the base fragment;
  one `{{var}}` per conditional-line fragment.
- Strict-equality lock tests proving byte-identical output for a fully
  populated input and for the bare input.
- No loader changes, no route changes, no parser changes.

## Out of scope

- Item 27 (recommendation migration), shared cross-directory fragments.
- Loader caching or single-entry loading (per-call `loadPromptSet` reads ~10
  small files per mint; mints are infrequent, so the simplest reversible
  design stands).
- `FROZEN_VOICE_SESSION_CONFIG`, credential providers, websocket URL builder.

## Build loop

`workflow.stepReview` is `feature`: implement all steps, then present one
review packet. `checkpointCommits` is disabled. Gates are manual: `pnpm
typecheck` and `pnpm test` (no Verify command declared). `/complete` creates
the final feature commit.

## Build steps

- [x] 1. Add `apps/api/src/prompts/voice-session/manifest.json` (`version: 1`,
  one entry per fragment with `requiredVars`) plus the Markdown fragments:
  base block (today's `BASE_INSTRUCTIONS`, conduct block, and session-context
  header with `Candidate: {{candidateId}}` / `Interview: {{interviewId}}`)
  and one fragment per conditional line (`Learner: {{profileSummary}}.`,
  `Configuration: {{configurationSummary}}`, `Focus topic: {{topicSummary}}.`,
  `Learning objective: {{objectiveSummary}}.`,
  `Prior skill state: {{skillSummary}}.`,
  `Current problem: {{problemSummary}}`,
  `Progress: {{responseCount}} recorded responses, {{hintsUsed}} hints used.`,
  `Code: {{sandboxSummary}}.`). No trailing newlines (loader reads raw bytes).
  - Done when: `manifest.json` validates against the loader schema and every
    `parts` file exists with byte-exact static text (punctuation and trailing
    periods match today's template literals).
- [x] 2. Rewire `buildSessionInstructions` in `voice-session.ts`: resolve the
  prompt dir from `import.meta.url`, call `loadPromptSet` per invocation with
  caller vars defaulted to `""` (progress counters defaulted with `?? 0` then
  stringified, as today), assemble the base lines plus conditional lines in the
  current fixed order with the current presence conditions, join with `"\n"`.
  Fail closed (let loader errors throw; `noUncheckedIndexedAccess`-safe entry
  access). Update the module header History with `26`.
  - Done when: `pnpm typecheck` passes and the function signature is unchanged.
- [x] 3. Add lock tests in `apps/api/tests/voice-session.test.ts` next to the
  existing phase-7 instruction tests: strict-equality (`toBe`) on the full
  output for one fixed fully-populated input and for the bare
  `{ candidateId, interviewId }` input (bare output contains no `Learner:` /
  `Focus topic:` lines). Keep existing `toContain` tests untouched.
  - Done when: focused voice-session tests pass and the expected strings are
    verified byte-identical against pre-change output (capture before/after or
    derive from the current literals, not from the new files).
- [x] 4. Run `pnpm typecheck` and the full `pnpm test` suite.
  - Done when: typecheck clean and full suite green with no regressions.

## Files / areas

- `apps/api/src/prompts/voice-session/manifest.json` (new)
- `apps/api/src/prompts/voice-session/*.md` (new, ~9 fragments)
- `apps/api/src/voice-session.ts` (`BASE_INSTRUCTIONS` removal,
  `buildSessionInstructions` rewire; callers in
  `apps/api/src/routes/voice-session.ts` untouched)
- `apps/api/tests/voice-session.test.ts` (lock tests only)

## Data / contracts

- Manifest shape: `{ version: 1, prompts: { <name>: { parts: [<file>],
  requiredVars: [<var>] } } }` per the feature-23 loader schema.
- `loadPromptSet` throws when any entry's `requiredVars` are missing from
  `vars`, so every call site must supply all vars (absent optionals as `""`,
  counters as `String(x ?? 0)`); code-side presence checks then select which
  rendered lines to keep, in fixed order.
- Observable contract: for every input, output equals
  `todayLines.join("\n")` exactly. Route payload shape (`session.instructions`
  string in `POST /api/interviews/:id/voice-session` 201 response) unchanged.

## Testing

- `pnpm typecheck` (`tsc --noEmit`).
- Focused: voice-session tests (file uses `buildApp`; run via its configured
  project, not `--project unit`), then full `pnpm test`.
- Lock tests: full-output `toBe` for populated + bare inputs; existing
  `toContain` / `not.toContain` assertions stay as regression cover.

## Notes for the AI

- Follow features 24/25 conventions: prompt dir resolved from `import.meta.url`
  (works under tsx-on-source dev/vitest/prod Docker which COPYs all of
  `apps/api/src`), no build-copy step, no em dashes, pnpm-only.
- The loader joins an entry's parts with `"\n"`; with one part per entry the
  fragment bytes are the entry bytes, so blank-line separators inside the base
  block live in `base.md` verbatim.
- Mandatory vars `candidateId` / `interviewId` are always present (required
  function params); their `requiredVars` entries keep startup/call validation
  fail-closed.
- Do not "simplify" by always rendering conditional lines: the bare-output
  contract (no `Learner:` etc. lines) and existing tests forbid it.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":6378,"specSha256":"55c8184600ece2f4be6c4841d4885b1ed6906e68e18b3ff7e56223d77b2833fc","branch":"refs/heads/feature/voice-session-instruction-migration","head":"b25d6901136296f0f9a62debdda26106f0eef225","baseRef":"refs/heads/main","baseCommit":"b25d6901136296f0f9a62debdda26106f0eef225","sourceTree":"e6016555fa1bef00899990c82db1ad66fcf3c9a0","absentOptional":[]} -->
