# Feature: Submit-verdict prompt migration

**Status:** verified

**From build-plan:** feature 24
**Build attempt:** 1
**Branch:** `feature/submit-verdict-prompt-migration`

## Goal

Move the submit-verdict system prompt out of `submit-verdict-model.ts` into a
Markdown fragment plus JSON assembly manifest, keeping parser, model call
shape, and route behavior unchanged.

## In scope

- New `apps/api/src/prompts/submit-verdict/manifest.json`:
  `{ version: 1, prompts: { "submit-verdict-system": { parts: ["system.md"] } } }`
  (no vars; the system prompt is fully static).
- New `apps/api/src/prompts/submit-verdict/system.md` containing the current
  10-line system prompt verbatim.
- `submit-verdict-model.ts` loads the system prompt once at module scope via
  `loadPromptSet` (resolved from `import.meta.url`, so dev, vitest, and the
  tsx-on-source Docker image all read the same files; a broken prompt file
  fails fast at boot). `buildSubmitVerdictMessages` keeps its signature and
  byte-identical output; the user message stays code-built JSON.
- Migration-lock test in `apps/api/tests/submit-verdict-model.test.ts`
  asserting the system message strictly equals the expected 10-line text, so
  any drift in content or joining fails loudly.

## Out of scope

- Evaluation, voice-session, and recommendation prompts (items 25-27).
- Shared-fragment reuse across prompts.
- Any change to `loadPromptSet`, parsers, model classes, routes, or `app.ts`.

## Build loop

`workflow.stepReview: "feature"` with `checkpointCommits: "disabled"`: build
all steps, then present one review packet. `/complete` creates the final
feature commit. No `Verify` command is declared, so gates are `pnpm typecheck`
and `pnpm test` (vitest).

## Build steps

- [x] 1. Submit-verdict prompt file migration with byte-identity lock
  - Done when: the system prompt lives in `system.md` + manifest, the model
    loads it at module scope, `buildSubmitVerdictMessages` output is
    strictly equal to the previous inline text (proven by the new lock test),
    all existing submit-verdict tests pass unchanged, and `pnpm typecheck`
    plus `pnpm test` are green.

## Files / areas

- `apps/api/src/prompts/submit-verdict/manifest.json` (new)
- `apps/api/src/prompts/submit-verdict/system.md` (new)
- `apps/api/src/submit-verdict-model.ts` (prompt source swap only)
- `apps/api/tests/submit-verdict-model.test.ts` (migration-lock assertion)

## Data / contracts

- Manifest follows the feature-23 loader contract (`version: 1`,
  `{ parts, requiredVars? }`, `{{name}}` interpolation; no vars used here).
- System message bytes sent to the model are unchanged; only their
  source-of-truth moves from inline TypeScript to the fragment file.

## Testing

- New strict-equality lock test plus all existing submit-verdict tests
  (prompt assembly, parsing, adapter, factory) passing unchanged.
- No live LLM needed; adapter tests use the existing fake transport.

## Notes for the AI

- `import.meta.url` plus `fileURLToPath` locates the fragment dir; the
  Dockerfile copies all of `apps/api/src`, so no build-copy step is needed.
- No em dashes in generated content, including the fragment and manifest.

<!-- blueprint:completion {"schemaVersion":1,"specBytes":3185,"specSha256":"61182b82b8192108e862070c1bf2b46d858a403b53d9fea455c662f5d4763a72","branch":"refs/heads/feature/submit-verdict-prompt-migration","head":"51c0639d5dfc8214c08ef87c2e0cd22435b83753","baseRef":"refs/heads/main","baseCommit":"51c0639d5dfc8214c08ef87c2e0cd22435b83753","sourceTree":"213201b375a3574f3e4adc8fd7a6f861b062c347","absentOptional":[]} -->
