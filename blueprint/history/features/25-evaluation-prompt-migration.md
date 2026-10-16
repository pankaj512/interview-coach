# Feature: Evaluation prompt migration

**Status:** verified

**From build-plan:** feature 25
**Build attempt:** 1
**Branch:** `feature/evaluation-prompt-migration`

## Goal

Move the evaluation system prompt out of `evaluation-model.ts` into a
Markdown fragment plus JSON assembly manifest, keeping scoring, parsing,
model call shape, and service behavior unchanged.

## In scope

- New `apps/api/src/prompts/evaluation/manifest.json`:
  `{ version: 1, prompts: { "evaluation-system": { parts: ["system.md"] } } }`
  (no vars; the system prompt is fully static).
- New `apps/api/src/prompts/evaluation/system.md` containing the current
  8-line system prompt verbatim.
- `evaluation-model.ts` loads the system prompt once at module scope via
  `loadPromptSet` (resolved from `import.meta.url`, so dev, vitest, and the
  tsx-on-source Docker image all read the same files; a broken prompt file
  fails fast at boot). `buildEvaluationMessages` keeps its signature and
  byte-identical output; the user message stays code-built JSON.
- Migration-lock test in `apps/api/tests/evaluation-model.test.ts`
  asserting the system message strictly equals the expected 8-line text, so
  any drift in content or joining fails loudly. No existing test asserts
  evaluation prompt content today; service tests use a fake model and are
  unaffected.
- Self-contained prompt directory: the one line shared with the
  submit-verdict prompt ("Reply with ONLY a JSON object...") is duplicated,
  not extracted. The loader resolves parts within a single directory, so a
  shared fragment would require loader changes for one duplicated line; the
  smaller reversible design wins.

## Out of scope

- Voice-session and recommendation prompts (items 26-27).
- Shared-fragment reuse across prompts (see scoping note above).
- Any change to `loadPromptSet`, parsers, model classes, services, routes,
  or `app.ts`.

## Build loop

`workflow.stepReview: "feature"` with `checkpointCommits: "disabled"`: build
all steps, then present one review packet. `/complete` creates the final
feature commit. No `Verify` command is declared, so gates are `pnpm typecheck`
and `pnpm test` (vitest).

## Build steps

- [x] 1. Evaluation prompt file migration with byte-identity lock
  - Done when: the system prompt lives in `system.md` + manifest, the model
    loads it at module scope, `buildEvaluationMessages` output is
    strictly equal to the previous inline text (proven by the new lock test),
    all existing evaluation tests pass unchanged, and `pnpm typecheck`
    plus `pnpm test` are green.

## Files / areas

- `apps/api/src/prompts/evaluation/manifest.json` (new)
- `apps/api/src/prompts/evaluation/system.md` (new)
- `apps/api/src/evaluation-model.ts` (prompt source swap only)
- `apps/api/tests/evaluation-model.test.ts` (migration-lock assertion)

## Data / contracts

- Manifest follows the feature-23 loader contract (`version: 1`,
  `{ parts, requiredVars? }`, `{{name}}` interpolation; no vars used here).
- System message bytes sent to the model are unchanged; only their
  source-of-truth moves from inline TypeScript to the fragment file.

## Testing

- New strict-equality lock test (minimal `EvaluationModelInput`, system
  message strictly equals the 8-line text) plus all existing evaluation
  tests (factory, service with fake model, loop) passing unchanged.
- No live LLM needed; the lock test exercises prompt assembly only.

## Notes for the AI

- `import.meta.url` plus `fileURLToPath` locates the fragment dir; the
  Dockerfile copies all of `apps/api/src`, so no build-copy step is needed.
- `system.md` must have no trailing newline: the loader reads fragments raw
  and a single part means file bytes equal prompt bytes.
- No em dashes in generated content, including the fragment and manifest.

<!-- blueprint:completion {"schemaVersion":1,"specBytes":3798,"specSha256":"4534894e3470faa2621f0b922e9259e1df17e3fd1bb8a842dd94c183c7ab8462","branch":"refs/heads/feature/evaluation-prompt-migration","head":"9f48b533569e4b9e949182f1c40afc328bbf68aa","baseRef":"refs/heads/main","baseCommit":"9f48b533569e4b9e949182f1c40afc328bbf68aa","sourceTree":"047cb56bf40fd390a9860fc6aa850098a6465e31","absentOptional":[]} -->
