# Project Plan

## 1. Problem - What problem are we solving?

Engineers prepping for DSA interviews get static problem lists and no
adaptive coaching. InterviewCoach runs a voice-led mock interview
(Azure Voice Live, `gpt-realtime-mini`), then closes the learning loop
server-side: profile -> curriculum -> recommendation -> interview ->
async evaluation -> skill update -> next recommendation.

> TODO (confirm): MVP scope is DSA-only; broader tracks (System Design,
> Behavioral, ML, Resume-based) come later as build-plan item V2-5.

## 2. Users - Who is this for?

- Engineers preparing for DSA interviews (roles: Frontend, Backend,
  Full Stack, Mobile, Data Scientist, ML, DevOps/SRE, Data Engineer,
  SWE, Other; levels Entry to Principal).
- MVP is DSA; later it evolves to a broader prep platform (per user interview).
- Sign-in required for the learning loop; guests see landing/sign-in only.
  A dev guest preview exists for local testing.

## 3. Features - What does the MVP need?

Shipped (see `build-plan.md` 1-13, verified in `docs/SESSION_HANDOFF.md`):

- Architecture principles frozen to ADR-002 (LLM is advisory, backend owns truth)
- User profile + required first-run onboarding (`GET/PUT /api/profile`)
- Server-owned curriculum + per-user skill state (12 modules, 59 topics, 300 problems)
- Synchronous LLM recommendation service with deterministic fallback
- Server-backed Dashboard (goal + recommended next + progress + strengths)
- Lobby (recommendation + mic + session prep, no manual selection)
- Grounded realtime interview room (profile/topic/objective/skill injected into mint)
- Canonical realtime tool surface (`get_current_interview`, `get_current_problem`, `submit_interview_data`, `end_interview`; legacy names stay deprecated aliases for the CLI harness)
- Server-backed persistence (transcript, `GET /api/interviews` history, recommendation linkage)
- Async LLM evaluation service (end returns immediately; job persists validated evaluation)
- Deterministic skill/curriculum update (monotonic mastery, idempotent per evaluation)
- Adaptive loop (evaluation -> skill update -> regenerated recommendation)
- Server-backed History, Progress, Weak-Areas views

Shipped since (see `build-plan.md` 14-17, 18a.1-18c, 20): green
main, UI prototype, isolated multi-language sandbox, fresh UI rebuild
(17a-17d), problem content slices + full reseed + new endpoints,
client URL routing.

Next (unchecked in `build-plan.md`): AI-only Submit (18d) and loop
verification (19); the v2 items stay deferred.

## 4. Data - What are we storing?

PostgreSQL via Drizzle (`packages/db/src/schema.ts`); backend owns truth:

- `users`, `user_sessions`, `user_profiles` (taxonomy: interview types, role, level, goals)
- `problems` (300 seeded, stable `prob_<slug>` IDs, `topic_id`), `curricula`,
  `curriculum_modules`, `curriculum_topics`, `curriculum_topic_problems`
- Problem statement/sample/starter content is DB-owned once reseeded;
  the external lookup cache stays a build-time import source only.
  Editors show the fetched LeetCode starters verbatim; a committed shared
  shape-runner library (one runner per I/O signature shape per language,
  `{runnerId, entry, codecs}` link per problem, shared ListNode/TreeNode
  prelude per language) makes sample tests executable in the sandbox.
- `user_skill_states` (PK `(user_id, curriculum_id, topic_id)`, mastery
  `not_started -> learning -> developing -> proficient -> mastered`,
  `last_evaluation_id` idempotency key), `user_curriculum_progress`
- `interviews` (`recommendation_id`/`topic_id`/`evaluation_status`,
  plain text by design so re-seeds never wipe progress), `interview_problems`,
  `interview_messages` (candidate/interviewer/system, 10k cap),
  `candidate_responses`, `submissions`, `code_runs`
- `recommendations` (type/status/source, supersession chain),
  `evaluations` (7 canonical dimensions + derived score/recommendation),
  `evaluation_jobs` (pending/running/completed/failed, 3 attempts)
- No raw audio stored; structured transcript only, retention in `docs/data-retention.md`.

## 5. Tech - What stack are we using?

Intentional, keep as-is (per user interview):

- `pnpm@12.3.4` monorepo (`packages/*`), `node >= 20`
- `packages/domain`: pure TypeScript, no I/O (entities, lifecycle, Result, branded IDs)
- `packages/backend`: Fastify 5 + Zod 4, owns application truth
- `packages/db`: Drizzle ORM + `postgres` driver, Postgres 16
- `packages/web-client`: React 19 + Vite 7 + TypeScript (no `VITE_AZURE_*`, `VITE_BACKEND_URL` only)
- Two LLM surfaces: Azure Voice Live realtime vs server-side Azure AI Foundry
  text deployment behind `RecommendationModel`/`EvaluationModel`
  (Managed Identity prod, API key local-dev only)
- Tests: Vitest everywhere; integration tests need a live `*_test` DB
- CI: `.github/workflows/ci.yml` (typecheck -> live-DB tests -> builds ->
  bundle secret scans -> container boot probe)

## 6. Monetize - How will this make money?

> TODO (confirm): no monetization established in code or docs. No ads,
> memberships, or payments found.

## 7. UI/UX - How should this look and feel?

> Web client rethink approved and rebuild underway (prototype item 15
> approved; `docs/interview-coach-ui-specification.md` is the locked target).

- Previous client (16 screens, ~3.7k lines) mixed three generations: the
  spec rebuild, Stitch v1.1 restyles, and the guest landing. Rebuild
  direction: throw away screens/components and rebuild on the kept
  wiring (`api/backend-client`, voice-client/tool-forwarder, backend APIs).
- Shipped: theme shell + public screens (17a), practice-loop screens
  Dashboard/Lobby/Live/Evaluating (17b), feedback screens (17c),
  account/history screens (17d), client URL routing (20), plus
  auth-entry/nav fixes (dead entry flows, auth nav polish).
- Ritual flow confirmed by the approved prototype and the shipped rebuild:
  Landing -> Sign-in -> Onboarding -> Dashboard -> Lobby -> Live ->
  Evaluating -> Results -> Transcript/Feedback ->
  History/Progress/Weak-Areas/Settings.
- Backend stays the design constraint: backend owns truth, browser never
  authoritative; small API additions only with a proven gap.

## 8. Deployment - Where and how will this ship?

- `docker-compose.yml`: `db` (postgres:16), `backend` (node:24-slim, boot-migrates,
  `HOST:PORT`, probes `GET /api/health|ready`, metrics `GET /api/metrics|/metrics/prometheus`),
  `web` (nginx:alpine `:8080`, SPA fallback, `VITE_BACKEND_URL` build-arg).
- Seed is an explicit one-off (`db:seed`); no auto registry push yet.
- Env: server-only `AZURE_*`/`LLM_*`/`DATABASE_URL`/`API_AUTH_TOKEN`/rate-limit
  and quota keys (see `.env.example`); secret scans run in CI.
- > TODO (confirm): no production host, domain, TLS, or backup target chosen;
  prod identity (S8d social/Entra + prod voice mint) is parked waiting on
  user-created provider resources.

## 9. Usage model and constraints (optional)

- Single-tenant local/dev operation today; expected user count not established.
- Authenticated learning loop (no anonymous loop); per-interview ownership enforced.
- Proportional engineering applies: no enterprise, multi-tenant, hostile-user, or
  compliance requirements inferred. Trust boundaries derived from reachability:
  session-scoped APIs, server-side LLM credentials, validated tool calls with
  `call_id` idempotency, quotas/rate limits as defense-in-depth. Candidate
  code execution is container-isolated via the Docker sandbox (build-plan
  item 16, shipped); remaining production security/observability hardening
  (roadmap Phase 14) is deferred to v2.
