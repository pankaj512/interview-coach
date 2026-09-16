# Coding Standards

> Adopted from the real code (2026-09-16), not the Next.js/Prisma defaults.
> Backend owns truth; the model owns conversation; PostgreSQL owns persistent state.

## TypeScript

- Strict mode plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (see `tsconfig.base.json`)
- No `any` - use proper typing or `unknown`
- Branded IDs (`ids.ts`: `User/Interview/Problem/Response/Evaluation/Event/Message/...`) with `node:crypto` UUIDs or stable slugs (`prob_<slug>`, `rec_<uuid>`, `msg_<uuid>`)
- Pure domain functions return `Result` (`result.ts`: `ok/err/map/andThen`); error codes in `errors.ts`
- Per-package `tsconfig.json` extends the base with NodeNext `.js`-suffix imports (Vite resolves them)

## Monorepo

- `pnpm`-only (never npm/yarn), `pnpm@12.3.4`, `node >= 20`, workspace `packages/*`
- `packages/domain`: pure, no I/O/HTTP/DB; entities, lifecycle state machine, services, repo interfaces + in-memory impls
- `packages/db`: Drizzle ORM + `postgres` driver; schema in `src/schema.ts`, migrations in `drizzle/`, seed via `tsx src/seed.ts`
- `packages/backend`: Fastify 5 product service built by `buildApp({repos, config, voiceProvider})`; routes in `src/app.ts`, services per concern
- `packages/web-client`: Vite + React 19, structural API mirrors only (never imports `@interview-coach/domain`, which pulls `node:crypto`)
- Async repos/services from day one so Postgres swaps impls without signature churn

## Backend

- Lifecycle owned here: `created -> ready -> in_progress <-> paused -> completing -> completed` (+ `cancelled`/`failed`); the model signals done, only the app transitions
- JSON error envelope `{ok:false, error:{code,message,retryable}}`; domain codes map to 400/404/409, never 500 for client errors
- Ownership hook scopes user callers to their own interviews (foreign reads 404, no oracle); create stamps identity from the session, body spoof ignored
- Tool calls dedup by `call_id` (`IdempotencyStore`: unseen -> once, executing -> singleflight, completed/failed-permanent -> replay; transient throws not stored)
- Logging is lifecycle/timing events only (pino); never bodies, audio, passwords, or tokens
- Secrets server-only (`LLM_*`, `AZURE_VOICE_API_KEY`, `API_AUTH_TOKEN`); blank LLM config means deterministic fallback loop

## Database

- Drizzle ORM for all persistence; migrations via `drizzle-kit generate` + `tsx src/migrate.ts` (never `db push` against real data)
- Upsert saves (replay/seed-safe); `db:seed` imports catalog then curriculum, idempotent
- `topic_id`/`problem_id`/`recommendation_id` are deliberately plain text (not FK'd) so a curriculum re-seed cannot wipe user progress or interviews
- CHECK constraints on enums, counts, and content caps; indexes on all `interview_id`/candidate lookups
- Live-DB tests must use a dedicated `*_test` DB (`TEST_DATABASE_URL`) or `ALLOW_DESTRUCTIVE_DB_TESTS=true` on a throwaway DB; never point them at the seeded dev DB (`truncateAll()` deletes the catalog)

## Data Fetching

- Client talks to the backend over HTTP only (`VITE_BACKEND_URL`); the browser is never authoritative for profile/interview/evaluation/skill/recommendation/curriculum state
- Validate all inputs with Zod at the route boundary, then re-validate in the domain
- Scope every user-owned query by the session caller id; never trust a client-supplied user id
- Transcript capture is browser-forwarded, backend-validated structured text only; no raw audio by default

## Error Handling

- Domain returns `Result`; services map to the `{ok:false}` envelope with `retryable` set (401 permanent, 429 retryable with `Retry-After`)
- Tool-exec 4xx failures return as data (model-facing, never retried); transport/5xx throw retryable errors with same-`call_id` retry (8s timeout, 2 retries, 300-800ms+jitter backoff)
- Evaluation/recommendation never fail the interview: invalid model output falls back deterministically; regeneration failures are counted, never fatal

## Naming

- Packages: `@interview-coach/<domain|backend|db|web-client>`
- Domain files: kebab-case per concern (`interview-service.ts`, `skill-update.ts`, `tool-service.ts`)
- Backend files: kebab-case per concern (`voice-session.ts`, `code-runner.ts`, `rate-limit.ts`)
- Client: `screens/*Screen.tsx`, `components/*`, `state/use-*.ts`, pure helpers beside usage (`dashboard.ts`, `lobby.ts`, `flow.ts`)
- Tests: colocated `tests/*.test.ts(x)` per package mirroring source names

## Styling

- Token-driven CSS (`tokens.css` + `styles.css`); Stitch v1.1 primitives in `ds/primitives.tsx` (SectionHead, Badge, ChipList, CtaCard, ProgressTrack, TableShell, CoachPanel, VoiceRail, TimelineRow, FormCard)
- No one-off screen CSS; no inline secret values; bundle must contain no `VITE_AZURE_*` values (CI scans)

## Testing

The blueprint installs no test runner; testing is opt-in at the project level,
because the overlay can't know your stack. Adding unit testing is an explicit
setup task the AI can do through the normal workflow, either as a build-plan item
or with `/tests`. The setup should choose the stack-native runner, wire the
scripts or commands, add a small example test, and update the Commands section
of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. The command does not enable an absent
test runner or replace focused evidence. It gives local work and optional CI one
exact command to run. `/ci` owns Verify and CI setup. `/tests` adds the real test
command to Verify when it already exists, but never creates CI only because
testing was configured.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  parsers, formatters, validators, id/slug builders, server actions. These have
  assertable inputs and outputs and real edge cases (empty, missing, malformed).
- **What not to test:** UI components and integration-level surfaces (render or
  export routes, anything driving a real browser or external service). Verify those
  with a screenshot and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. The project's test command
  must be green before the step is approved, before any checkpoint commit, and
  before `/complete` merges. UI and integration-only steps are exempt and ride on
  screenshot plus build evidence.
- **When it's named:** the `/feature` spec's Testing section predicts the coverage,
  `/implement` writes the test with the step, and if a step surfaces logic the spec
  didn't foresee, add a focused test then.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `feature.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`), not a
  hardcoded tool name.

Stack binding: Vitest everywhere (`vitest run` via `pnpm test`); use fakes for
external dependencies (in-memory repos, fake voice provider, fake LLM models,
fake job runner with `runSynchronously`); live-DB persistence tests run against
a `*_test` Postgres via `TEST_DATABASE_URL` and warn-and-pass without one.

## Browser Verification

For UI and integration behavior, prefer real browser evidence over reading the
code and assuming it works.

- Browser automation is separately opt-in through `/tests browser`. That setup
  reuses a compatible runner or prefers Playwright for supported projects, then
  documents the exact command as `Browser tests` in `AGENTS.md`.
- When `Browser tests` is declared, add focused coverage for stable behavioral
  done-whens when it is proportionate, and run the documented command during
  `/check`. Do not assume it proves visual fidelity, real authenticated-profile
  behavior, browser chrome, or another claim the test does not observe.
- If no Browser tests command is declared, do not add a runner silently in the
  middle of an unrelated feature. Use the available dev server, browser
  screenshots, build output, API output, or manual evidence instead.
- Browser tests are not part of the default Verify command or CI unless the user
  separately chooses that slower gate.
- Browser evidence is especially important for flows that click, type, submit,
  navigate, download files, render complex layouts, or depend on client-side
  state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
