# Fix: Backend autoloads .env with the Node native loader

**Type:** Fix
**Status:** verified
**Branch:** `fix/backend-env-file`

## The problem

The backend (`pnpm --filter @interview-coach/backend dev`, `tsx watch
src/server.ts`) has no env-file loader: a project `.env` is silently ignored
unless the developer remembers `set -a; source .env; set +a` first. That
already caused one real misfire (backend pointed at the wrong postgres).
`docker compose` interpolates `.env` for its own use, but the directly-run
dev server never reads it.

## The fix

Call `process.loadEnvFile()` (Node built-in, no new dependency) at the top
of the backend entrypoint before config is read, guarded so a missing `.env`
boots exactly as today. Rely on native precedence: explicitly exported
variables win over file values. Production behavior unchanged (env comes
from the host; a stray `.env` must never be required). No dotenv package,
no changes to compose files, Dockerfiles, or CI.

Must not break: `docker compose` boot path (container has no `.env` file;
guard covers it), `db:seed` / `db:migrate` CLIs if they share config
loading, existing tests, secret discipline (`.env` stays git-ignored).

## Build steps

- [x] 1. Native `.env` autoload in the backend entrypoint with missing-file
  guard; no override of exported vars; no new dependency.
  Done when `pnpm typecheck` is green and backend tests pass, plus boot
  proof: (a) `.env`-only `DATABASE_URL` connects on `dev`, (b) an exported
  `DATABASE_URL` wins over the file, (c) renamed-away `.env` boots as today.

- [x] 2. Root dev scripts. `dev:backend` (backend `dev`), `dev:web`
  (web-client `dev`), and `dev` running both in parallel with no new
  dependency; replaces the stale S0 echo placeholder.
  Done when all three scripts start the expected processes.

## Verify

- `pnpm typecheck`, `pnpm test`, `pnpm build`.
- The three boot proofs above against the local docker postgres.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":1939,"specSha256":"564a5d6166f292fdfd5720a823ebc36982c2f4de2123500fc2dccf6f0ab179ba","branch":"refs/heads/fix/backend-env-file","head":"8199499187f1bbde6e1c8f801d6b7ad07459b4fe","baseRef":"refs/heads/main","baseCommit":"8199499187f1bbde6e1c8f801d6b7ad07459b4fe","sourceTree":"bc95777b7093a8b2e78b2d7fb3b1804b34a25eee","absentOptional":[]} -->

## Completion record

Work branch `fix/backend-env-file` (base `main@8199499`). Two changes, no
new dependency:

- `packages/backend/src/server.ts`: guarded native `process.loadEnvFile()`
  anchored at the repo root via `import.meta.url`, before `loadConfig()`.
  Missing file boots as before; exported vars keep native precedence.
- Root `package.json`: `dev:backend`, `dev:web`, and parallel `dev`
  (multi-filter, no new runner); replaced the stale S0 echo placeholder.

Final gates (2026-09-18, this session): `pnpm typecheck` clean,
`pnpm test` 482 passed, `pnpm build` (`tsc -b`) clean. Boot proofs
against docker postgres (:5433): .env-only boot -> /api/ready 200;
exported dead-port URL -> NOT_READY (export wins); .env moved away ->
boots identically to pre-fix behavior. `pnpm dev` proof: backend ready 200
+ Vite 200 from one command. All proof servers killed afterwards.

No findings resolved by this fix; F-01..F-04 (P2/P3, feature-16 audit) stay
open verbatim in the ledger. No independent review requested or required
(all regular gates manual; loader touches no credential logic).
