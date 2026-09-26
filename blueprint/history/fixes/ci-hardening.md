# Fix: CI hardening (heap, permissions, docs-only skip)

- **Type:** Fix
- **Status:** verified
- **Branch:** `fix/ci-hardening`

## The problem

`.github/workflows/ci.yml` has three gaps found by code review (no CI run observed failing yet):

1. The `Build web client` step runs `vite build` with the default Node heap, while every local build in this session has needed `NODE_OPTIONS=--max-old-space-size=8192`. Real OOM/flake risk on the runner.
2. The workflow declares no `permissions:`, so `GITHUB_TOKEN` gets broad defaults for a pipeline that only needs checkout.
3. Docs-only commits (e.g. plan syncs under `blueprint/**`, `docs/**`) trigger the full pipeline: typecheck + live-DB tests + builds + container boot probe, ~10+ minutes for markdown changes.

## The fix

Workflow-only change, no product code:

- Step 1: add `NODE_OPTIONS: --max-old-space-size=8192` env to the `Build web client` step (parity with the local build command).
- Step 2: add top-level `permissions: contents: read`.
- Step 3: add `paths-ignore: ['blueprint/**', 'docs/**', '*.md']` to the `push: branches: [main]` trigger (skips only when ALL changed paths are docs; mixed commits still run full CI). PR trigger unchanged.

Must not break: YAML validity, secret-scan steps (untouched; they scan `dist/` and `backend/src/`, which docs changes cannot affect), container boot probe.

## Build steps

- [x] 1. Apply the three workflow edits.
  Done when: `git diff` shows only `.github/workflows/ci.yml` changed with the heap env, the permissions block, and the paths-ignore filter, and nothing else.

## Verify

- `python3 -c "import yaml"` or equivalent YAML parse of the edited file (no yaml lib install; use `node --check`? no — validate with a one-liner parse, e.g. `node -e` with a vendored parse is overkill; simplest: `python3 -c 'import yaml,sys; yaml.safe_load(open(...))'` if PyYAML exists, else `npx --yes js-yaml`? No new deps ideally — try python3+PyYAML, fall back to reporting the exact diff for user eyeball).
- `git diff` review confirms no product/step changes.
- Full CI proof is the next push to `main`/PR; not runnable locally without GitHub Actions (no act harness in repo — do not add one).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2203,"specSha256":"50abc86b5474aec3e70aa09754934fc611533fb54f3465132dd24299457098a3","branch":"refs/heads/fix/ci-hardening","head":"b469c27b0d85044baec97c3af74b5c56677f24b8","baseRef":"refs/heads/main","baseCommit":"b469c27b0d85044baec97c3af74b5c56677f24b8","sourceTree":"a628cfeb64c7558c7e12eef87d8601bd241d2192","absentOptional":[]} -->
## Completion record

Work branch `fix/ci-hardening` (base `main@b469c27`, no prior archive at this path). Workflow-only hardening of `.github/workflows/ci.yml`, no product code:

- `Build web client` step gains `NODE_OPTIONS: --max-old-space-size=8192` (parity with the local build command; every local build in this session needed the 8GB heap flag).
- Top-level `permissions: contents: read` (pipeline only needs checkout).
- `paths-ignore: ['blueprint/**', 'docs/**', '*.md']` on the `main` push trigger (docs-only commits skip CI; mixed commits still run full CI; PR trigger unchanged).
- Secret-scan steps, test/build steps, and the container boot probe untouched.

Gates (this session): YAML parses (`python3 yaml.safe_load` → YAML-OK); `git diff` review confirms only `ci.yml` plus the spec itself changed. No logic touched, so no test runner involvement. Full CI proof happens on the next push to `main` or PR (no local Actions harness in repo, none added); documented in the spec Verify section.

No findings resolved by this fix; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: CI config only, no product, secret, or trust-boundary change).
