# InterviewCoach - Project Overview

<!-- blueprint:source-hash 4f60292fc0f3b4b2cdeccba330fb92e9606c43f6338a1c71585992a02e6d62f9 -->

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

## Features

Shipped (1-16, 17a/b, 20):

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
- **17a/b (UI rebuild, part)** - theme shell + public screens, then Dashboard/Lobby/Live/Evaluating on the new theme.
- **20. Client URL routing** - History-API routing (no router dep): real URLs per view, working back/forward, sane refresh/deep-link landings.

Next (17c/d, 18-19):

- **17c. Feedback screens** - rebuild Results, Transcript review, Feedback detail, Weak areas.
- **17d. Account and history screens** - rebuild History, Progress, Settings, Profile; delete consumed `prototypes/`.
- **18. Problem enrichment** - statement, samples, boilerplate per problem (title-only until then).
- **19. Loop verification** - end-to-end pass against a live DB; no new functionality.

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

### Recommendation

- `type` (`new_topic|continue_topic|reinforce_weakness|review_topic|advance_topic`),
  `topicId`, `problemId`, `reason`; `source` (`llm|fallback`);
  `status` (`active|accepted|superseded` supersession chain)

### Evaluation / EvaluationJob

- 7 dimensions x 0-5 + evidence/feedback; `overallScore` 0-100 derived;
  `status`/`source`/`topicId`/`jobId`. Jobs (`pending|running|completed|failed`,
  <=3 attempts) run in-process for v1.

## Tech stack

- **pnpm@12.3.4 monorepo** (`packages/*`), node >= 20 - only package manager
- **domain** - pure TypeScript, no I/O; entities, lifecycle, Result, branded IDs
- **backend** - Fastify 5 + Zod 4; owns application truth
- **db** - Drizzle ORM + `postgres` driver on Postgres 16
- **web-client** - React 19 + Vite 7 (`VITE_BACKEND_URL` only, never secrets)
- **LLMs** - Azure Voice Live realtime vs server-side Foundry text behind
  `RecommendationModel` / `EvaluationModel` (Managed Identity prod, key local-dev)
- **Tests / CI** - Vitest everywhere (live `*_test` DB or warn-and-pass);
  `.github/workflows/ci.yml`: typecheck -> tests -> builds -> secret scans -> boot probe

## Monetization

None established. No ads, memberships, or payments in code or docs.

## UI/UX

Client rethink approved and rebuild underway: the approved prototype plus
`docs/interview-coach-ui-specification.md` (locked target) define the look.
Shipped: theme shell + public screens (17a), practice-loop screens (17b),
client URL routing (20), two auth-entry/nav fixes. Pending: 17c/17d screens.
Confirmed ritual flow:

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
