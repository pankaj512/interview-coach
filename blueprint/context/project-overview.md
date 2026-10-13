# InterviewCoach - Project Overview

<!-- blueprint:source-hash eb8538986cadab4fb6d0bd202c5fd88ef6c9588acbd6eea8a2ca85a433820077 -->

> Voice-led DSA interview coach with a server-owned adaptive learning loop:
> profile -> curriculum -> recommendation -> Voice Live interview ->
> async evaluation -> skill update -> next recommendation.

## Problem

Engineers prepping for DSA interviews get static problem lists and no
adaptive coaching. InterviewCoach runs a voice-led mock interview over
Azure Voice Live and closes the learning loop server-side, so practice
is chosen by the system from persisted skill state, not by browsing.

## Users

- Engineers prepping for DSA interviews (roles Frontend through SWE/Other;
  levels Entry to Principal). Each needs recommended next practice, live
  interview simulation, and actionable feedback.
- Sign-in required for the learning loop; guests see landing/sign-in only
  (plus a dev-only guest preview for local testing).

## Usage model

- Single-tenant local/dev operation today; expected user count not established.
- Authenticated loop only; per-interview ownership enforced.
- Trust boundaries from reachability: session-scoped APIs, server-side LLM
  credentials, `call_id`-idempotent tool calls, quotas/rate limits as
  defense-in-depth. No enterprise, multi-tenant, hostile-user, or
  compliance requirements inferred.
- Candidate code execution is container-isolated via the Docker sandbox
  (item 16, shipped); remaining production security/observability hardening
  (roadmap Phase 14) is deferred to v2.

## Features

Shipped (1-21, V1.1-1, V1.1-2, in build-plan order):

1. **Architecture principles** - ADR-002 alignment; LLM advisory, backend owns truth.
2. **Profile + onboarding** - `UserProfile`, taxonomy, required first-run gate.
3. **Curriculum + skill state** - server-owned curriculum (12 modules / 59 topics / 300 problems), per-user mastery.
4. **Recommendation service** - synchronous LLM proposal validated against a candidate set, deterministic fallback.
5. **Dashboard** - goal + recommended-next CTA + progress + strengths.
6. **Lobby** - recommendation + mic + session prep; manual setup retired.
7. **Interview room** - profile/topic/objective/skill injected into the voice mint; frozen realtime config intact.
8. **Tool architecture** - canonical 4-tool surface (`get_current_interview`, `get_current_problem`, `submit_interview_data`, `end_interview`); legacy aliases for the CLI harness.
9. **Interview persistence** - server transcripts, history listing, recommendation linkage.
10. **Evaluation service** - async job on end; validated structured evaluation; fallback never loses interviews.
11. **Skill update** - deterministic monotonic mastery, idempotent per evaluation.
12. **Adaptive loop** - evaluation triggers supersede + regenerate; loop metrics.
13. **History + progress** - server-backed views; localStorage authority retired.
14. **Green main** - typecheck + test failures fixed; CI green.
15. **UI prototype** - throwaway mockups rethinking the client; locked target for the rebuild.
16. **Isolated sandbox** - Docker-isolated C++/JS/Python execution behind the existing sandbox routes; local runner retired.
17. **Fresh UI rebuild** - theme shell + public screens (17a), practice-loop screens (17b), feedback screens (17c), account/history screens (17d) on the new theme.
18. **Problem content slices (18a.1-18c)** - cleaned statements/constraints/array-encoded samples for all 300; per-language starter-signature census, shared node-type prelude + shape runners, `{runnerId, entry, codecs}` link metadata; full reseed; new problem-content endpoints adopted by the problem pane.
19. **AI-only Submit (18d)** - backend second-AI correctness/optimality verdict with break-points and edge cases; no sandbox run, nothing persisted; unconfigured keys surface a friendly 503; voice stays interview-only.
20. **Loop verification (19)** - end-to-end pass dashboard -> lobby -> live -> evaluating -> results -> history/progress against a live DB; no new functionality.
21. **Client URL routing (20)** - History-API routing (no router dep): real URLs per view, working back/forward, sane refresh/deep-link landings.
22. **Provider-switchable LLM transport (21)** - one shared chat-completions transport with per-provider entries (Azure AI Foundry + Inception Mercury) behind `LLM_PROVIDER`; recommendation, evaluation, and submit-verdict keep their prompts/parsers/ports and gain live LLM coverage once keys set.
23. **Apps/packages layout + rename (V1.1-1)** - `apps/api` (`@interview-coach/api`), `apps/web` (`@interview-coach/web`), `packages/core` (`@interview-coach/core`), `packages/store` (`@interview-coach/store`); all specifiers, filters, Dockerfiles, compose, CI, and live docs updated in one pass.
24. **Test kind-split (V1.1-2)** - `test:unit` (pure, no infra) / `test:integration` (needs Postgres/Docker; warn-and-pass locally, live in CI) / `test:e2e` (compose boot + probes) via vitest projects + CI jobs.
25. **Retirements + drift sweep (V1.1-3)** - pre-18c problem endpoint deleted (content endpoint is the only per-problem read), deprecated tool aliases removed end to end, dashboard migrated to the content view.

Next - v1.1 tail (no behavior change; `v1.0` = current main tagged, `v1.1` tagged on the milestone merge):

- **V1.1-4. Comment readability pass + convention** - module headers lead with what/ownership/surprises, why-only function comments, plus a comment-convention rule in coding standards.

Deferred to v2: security/observability hardening, testing consolidation,
final integration, prod identity + voice, multi-track expansion.

## Data model

PostgreSQL via Drizzle; backend owns truth. Re-seeds never wipe user state:
`topic_id` / `problem_id` / `recommendation_id` are plain text, not FKs.

### User

- `id`, `email` (normalized, unique), `passwordHash` (nullable for pre-auth rows)
- 1-n `UserSession`, 1-1 `UserProfile`

### UserSession

- `tokenHash` (raw shown once), `expiresAt`; lazy revocation of expired/orphaned rows

### UserProfile

- `userId` (PK, FK cascade), `interviewTypes[]`, `role`, `level`, `goals?` (<=500, blank = absent)

### Problem

- `id` (`prob_<slug>`), `title`, `difficulty`, `topicId`, source links
- Statement/sample/starter content is DB-owned (reseeded 18b);
  the external lookup cache stays a build-time import source only.
- Editors show the fetched LeetCode starters verbatim; sample tests run
  them in the sandbox via the shared shape-runner library: one committed
  runner per I/O signature shape per language, `{runnerId, entry, codecs}`
  link per problem (inline runner only when no shape fits), shared
  ListNode/TreeNode prelude per language, lists/trees array-encoded
  across the case boundary.

### Curriculum tree

- `Curricula` (`id` = interview type, e.g. `dsa`) -> `Modules` -> `Topics`
  (global 1-based order) -> `TopicProblems` (ordered problem ids)

### UserSkillState

- `(userId, curriculumId, topicId)` PK; `masteryLevel`
  (`not_started -> learning -> developing -> proficient -> mastered`);
  `successfulAttempts` / `totalAttempts`; `lastAttemptAt`, `lastOutcome`;
  `strengths[]`, `weaknesses[]`; `lastEvaluationId` (idempotency key)

### UserCurriculumProgress

- `(userId, curriculumId)` PK; `currentTopicId`; `completedTopicIds[]` (mastered, curriculum-ordered)

### Interview

- `id`, `candidateId` (ownership-scoped), lifecycle status
  (`created -> ready -> in_progress <-> paused -> completing -> completed` + `cancelled`/`failed`)
- `recommendationId?`, `topicId?`, `evaluationStatus` (`none|pending|completed|failed`)

### InterviewProblem / InterviewMessage / CandidateResponse

- Assignments `(interviewId, order)` with current pointer; messages
  (`candidate|interviewer|system`, content <=10k, batch <=100);
  responses (`kind`, content <=10k, `problemId?`)

### CodeSubmission / CodeRun

- Submissions (`c++|javascript|python`; code <=50k) -> runs (test cases
  1-50, hidden actuals masked, timeout/error as results)
- The 18d Submit path is AI-only: no sandbox run and no persisted
  verdict in this pass.

### Recommendation

- `type` (`new_topic|continue_topic|reinforce_weakness|review_topic|advance_topic`),
  `topicId`, `problemId`, `reason`; `source` (`llm|fallback`);
  `status` (`active|accepted|superseded` supersession chain)

### Evaluation / EvaluationJob

- 7 dimensions x 0-5 + evidence/feedback; `overallScore` 0-100 derived;
  `status`/`source`/`topicId`/`jobId`. Jobs (`pending|running|completed|failed`,
  <=3 attempts) run in-process for v1.

## Tech stack

- **pnpm@12.3.4 monorepo** (`apps/*`, `packages/*`), node >= 20 - only package manager
- **core** - pure TypeScript, no I/O; entities, lifecycle, Result, branded IDs
- **api** - Fastify 5 + Zod 4; owns application truth
- **store** - Drizzle ORM + `postgres` driver on Postgres 16
- **web** - React 19 + Vite 7 (`VITE_BACKEND_URL` only, never secrets)
- **LLMs** - Azure Voice Live realtime vs server-side text behind
  `RecommendationModel` / `EvaluationModel` (Managed Identity prod, key local-dev);
  shared provider-switchable chat-completions transport (Azure AI Foundry +
  Inception Mercury behind `LLM_PROVIDER`) is item 21, shipped
- **Tests / CI** - Vitest projects `test:unit` / `test:integration` (live `*_test` DB or warn-and-pass) / `test:e2e` (compose boot + probes);
  `.github/workflows/ci.yml`: typecheck -> tests -> builds -> secret scans -> boot probe
- Workspace packages stay `0.1.0` private, tags carry releases

## Monetization

None established. No ads, memberships, or payments in code or docs.

## UI/UX

Client rethink approved and rebuild complete through 17d: the approved prototype plus
`docs/interview-coach-ui-specification.md` (locked target) define the look.
Shipped: theme shell + public screens (17a), practice-loop screens (17b),
feedback screens (17c), account/history screens (17d), client URL routing (20),
plus small room/voice hardening fixes (join flash gate, pause/mute hardening,
resume continuity, live-code tool, editor language memory). Confirmed ritual flow:

- `/` landing -> sign-in -> onboarding -> dashboard (recommendation CTA) ->
  lobby (automated checks) -> live DSA (problem + editor) -> evaluating ->
  results (/100 + 7 x /5) -> history / progress / weak-areas / settings
- MVP is DSA-only and voice-only: no manual setup, no text mode, End is the
  only interview control, icon-state voice indicator.

## Deployment

- `docker-compose.yml`: `db` (postgres:16), `backend` (node:24-slim,
  boot-migrates, `HOST:PORT`), `web` (nginx:alpine `:8080`, SPA fallback,
  `VITE_BACKEND_URL` build-arg). Seed via one-off `db:seed`.
- Sandbox execution needs a Docker socket mount plus the configured runner images.
- Commands: `pnpm install|typecheck|test|build|lint`; per-package
  `dev|start`, `db:generate|db:migrate|db:seed`.
- Probes `GET /api/health|ready`; metrics `GET /api/metrics|/metrics/prometheus`.
- Env (server-only): `DATABASE_URL`, `AZURE_*`, `LLM_*`, `API_AUTH_TOKEN`,
  rate-limit/quota keys; secret scans in CI.
- > TODO: no production host, domain, TLS, backup target, or registry chosen;
  prod identity + voice mint parked on user-created provider resources.

## Open questions

- > TODO (confirm): broader tracks beyond DSA and their timing.
- > TODO (confirm): monetization, if any.
