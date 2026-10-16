# Feature: Prompt file infrastructure (Markdown + JSON assembly)

**From build-plan:** feature 23
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/prompt-file-infrastructure`

## Goal

Add `apps/api/src/prompts/` with a loader and schema-validated JSON assembly
manifest for Markdown prompt parts, variable interpolation, and startup-safe
validation errors. Infra only: all existing inline prompt behavior stays active
in this step; content migration happens in items 24-27.

## In scope

- New `apps/api/src/prompts/loader.ts`: reads a JSON assembly manifest plus
  Markdown fragment files from a directory, validates the manifest with Zod,
  interpolates `{{variable}}` placeholders from a caller-supplied vars record,
  and returns assembled prompt strings keyed by prompt name.
- Manifest schema: `{ version: 1, prompts: Record<name, { parts: string[], requiredVars?: string[] }> }`
  where `parts` are fragment filenames assembled in order, joined with `"\n"`.
- Fail-closed validation: unknown manifest version, missing fragment file,
  missing interpolation variable, or empty assembled output throws a
  descriptive `Error` naming the manifest path, prompt name, and field.
  Errors are safe to surface in boot logs (names and fields only, never
  fragment bodies).
- Unit tests in `apps/api/tests/prompts-loader.test.ts` covering assembly
  order, interpolation, and each failure mode.

## Out of scope

- Moving any prompt content out of `submit-verdict-model.ts`,
  `evaluation-model.ts`, `voice-session.ts`, or `recommendation-model.ts`
  (items 24-27). Those files are untouched in this step.
- Any change to model call shape, parsers, routes, or `app.ts` wiring.
- Shared-fragment reuse across prompts (decided per migration item).

## Build loop

`workflow.stepReview: "feature"` with `checkpointCommits: "disabled"`: build
all steps, then present one review packet. `/complete` creates the final
feature commit. No `Verify` command is declared in `AGENTS.md`, so gates are
`pnpm typecheck` and `pnpm test` (vitest).

## Build steps

- [x] 1. Prompt manifest loader with interpolation and validation
  - Done when: `apps/api/src/prompts/loader.ts` loads a manifest directory,
    assembles multi-part Markdown prompts in order, interpolates
    `{{variable}}` placeholders, and throws field-naming errors for bad
    version, missing file, missing variable, or empty output. New unit tests
    in `apps/api/tests/prompts-loader.test.ts` cover assembly order,
    interpolation, and every failure mode. `pnpm typecheck` and `pnpm test`
    are green.

## Files / areas

- `apps/api/src/prompts/loader.ts` (new)
- `apps/api/tests/prompts-loader.test.ts` (new)

## Data / contracts

- Manifest JSON shape (Zod-validated, versioned with `version: 1` so later
  shape changes are detectable, not silent).
- Interpolation syntax is exactly `{{name}}` (ASCII word characters).
  Values come from the caller vars record only; no environment access in the
  loader, so secrets can never leak through prompt assembly.
- Loader is pure sync filesystem reads plus validation; designed to run once
  at startup by later migration items.

## Testing

- New colocated-style unit tests (`apps/api/tests/prompts-loader.test.ts`,
  following the existing `*.test.ts` convention) using temp-dir fixture files.
  No live infra needed.
- Existing prompt-assembly tests (`submit-verdict-model`, `evaluation-model`,
  `recommendation-model`, `voice-session`, `llm-transport`) must stay green
  unchanged, proving inline behavior is still active.

## Notes for the AI

- Zod 4 is the repo validation standard; reuse it for the manifest schema.
- Follow the module-header convention in
  `blueprint/context/coding-standards.md` (what/owns/surprising, one trailing
  history pointer, max ~8 lines). No em dashes in generated content.
- Keep functions small; comment only the why.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3883,"specSha256":"ee18b7af92559650a7b7a652e1e741cf3d755171fbd7ef40a927c15a7804be1d","branch":"refs/heads/feature/prompt-file-infrastructure","head":"3440441c63cd94c9ff66a499a9754472c3bee1f4","baseRef":"refs/heads/main","baseCommit":"3440441c63cd94c9ff66a499a9754472c3bee1f4","sourceTree":"a95150612e675d7eaa2ac96ea885fc46860dd6d8","absentOptional":[]} -->
