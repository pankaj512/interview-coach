# Fix: coding-standards monorepo map names pre-rename packages

**Type:** Fix
**Status:** verified
**Branch:** `fix/coding-standards-monorepo-map`
**Fixes:** F-15

## The problem

`blueprint/context/coding-standards.md:16-20` (Monorepo section) still maps the stack to the pre-V1.1-1 layout: `packages/domain`, `packages/db`, `packages/backend`, `packages/web-client` (plus `workspace packages/*` and a never-import-`@interview-coach/domain` client rule). V1.1-1 renamed these to `packages/core`, `packages/store`, `apps/api`, `apps/web` (`@interview-coach/core`, etc.). An agent following the standards literally goes to directories that no longer exist. Full finding text in `blueprint/context/findings.md` (F-15, P3, open).

## The fix

Update the five Monorepo bullets to the post-rename paths (`packages/core`, `packages/store`, `apps/api`, `apps/web`; `workspace packages/*, apps/*`; `@interview-coach/core` in the client rule). Check the rest of `coding-standards.md` for other stale pre-rename references (e.g. Naming section `Packages: @interview-coach/<domain|backend|db|web-client>`) and update those too. Leave `blueprint/history/*`, `docs/audit/*`, `docs/SESSION_HANDOFF.md`, and `docs/implementation-roadmap.md` untouched as immutable/archival. Must not break anything: docs-only change, no code, no behavior change.

## Build steps

- [x] Step 1 - Update the Monorepo bullets (and any other stale pre-rename path in the same file) to the post-rename layout. Done when `grep` for `packages/domain`, `packages/db`, `packages/backend`, `packages/web-client`, `@interview-coach/domain` under `blueprint/context/coding-standards.md` returns zero matches (excluding intentional history notes, of which there should be none).

## Verify

- Read the updated Monorepo section and confirm all four paths resolve to real directories (`packages/core`, `packages/store`, `apps/api`, `apps/web`).
- `rg 'packages/(domain|db|backend|web-client)|@interview-coach/domain' blueprint/context/coding-standards.md` returns nothing.

<!-- blueprint:completion {"schemaVersion":1,"specBytes":2026,"specSha256":"b3c578520c99e2093d4d8d1c9769c14b5b447fcd54623e67424a8f049f92ef5a","branch":"refs/heads/fix/coding-standards-monorepo-map","head":"210174dbe919942120517864903b5fcf93bac2fd","baseRef":"refs/heads/main","baseCommit":"210174dbe919942120517864903b5fcf93bac2fd","sourceTree":"4d43cbc134f6960f7bea4e3fbd88dd69770e714c","absentOptional":[]} -->

## Completion

- **Completed:** 2026-10-12 via `/complete` on branch `fix/coding-standards-monorepo-map` (head == base == main@210174d at archival). Fixes F-15.
- **Changes:** `blueprint/context/coding-standards.md` Monorepo bullets updated to the post-rename layout (`packages/core`, `packages/store`, `apps/api`, `apps/web`; `workspace packages/*, apps/*`; `@interview-coach/core` client rule) plus the Naming `Packages:` line (`@interview-coach/<core|api|store|web>`). Docs-only; no code, no behavior change; immutable history/docs untouched.
- **Gates:** `pnpm typecheck` clean. No audit, independent review, check, or try guide selected (docs-only P3 standards fix, non-sensitive, non-behavioral, not user-facing).
- **Findings:** none resolved by this work. F-15 [P3] marked fixed by `/implement` and REMAINS FIXED in `blueprint/context/findings.md` for a later `/audit` re-review; it is not archived here. F-01..F-14 were already closed by earlier items and stay verbatim in the ledger.
