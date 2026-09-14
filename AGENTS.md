# AGENTS.md — InterviewCoach

## Repo state: learning loop — Phase 6 (Lobby) landed

Runners (locked, pnpm-only — never npm/yarn):
- `pnpm install` — install workspace deps
- `pnpm typecheck` — `tsc --noEmit` (root `tsconfig.json` includes `packages/**/*.ts`; S0 smoke file only, per-package tsconfigs land in S1+)
- `pnpm build` — `tsc -b`
- `pnpm test` — `vitest run`
- `pnpm lint` — `tsc --noEmit` (eslint lands only if S8 needs it)
- DB local: `docker compose up db` (postgres:16, see `.env.example`)
- DB package (`packages/db`, S2): `pnpm --filter @interview-coach/db db:generate|db:migrate|db:seed` with `DATABASE_URL` set; integration tests need a live DB (`docker compose up db` + `db:migrate`), warn-and-pass without one. **Never point the live-DB tests at the seeded dev DB**: they call `truncateAll()`, which deletes the `problems` catalog. Use a dedicated `*_test` DB via `TEST_DATABASE_URL`, or set `ALLOW_DESTRUCTIVE_DB_TESTS=true` only for a throwaway DB
- Backend (`packages/backend`, S3): `DATABASE_URL=... pnpm --filter @interview-coach/backend dev|start` (Fastify on `HOST:PORT`, default `127.0.0.1:3000`); backend tests use in-memory repos + fake voice provider, no DB needed
- Web client (`packages/web-client`, S4): `pnpm --filter @interview-coach/web-client dev|build|preview|typecheck` (Vite + React on `127.0.0.1:5173`, `VITE_BACKEND_URL` only — never `VITE_AZURE_*`); `vitest` covers pure modules (api client, tool forwarder, audio, voice client) with fakes, no mic/WS needed
- Hardening (S8a): `API_AUTH_TOKEN` gates `/api` (health/ready open); `GET /api/ready`, `GET /api/metrics`, `GET /api/metrics/prometheus`; quotas via `RATE_LIMIT_*`/`VOICE_MAX_ACTIVE_SESSIONS`/`CODE_RUN_MAX_*` (see `.env.example`)
- Deploy (S8b): `docker compose up -d db backend web` (backend migrates on boot on `HOST:PORT`, default `0.0.0.0:3000` in compose; web on `:8080`); seed once via `docker compose run --rm backend pnpm --filter @interview-coach/db db:seed`; images build from repo root (`docker build -f packages/backend/Dockerfile .`, `docker build -f packages/web-client/Dockerfile .`); CI (`.github/workflows/ci.yml`) runs typecheck → live-DB tests → builds → bundle secret scans → container boot probe; retention policy in `docs/data-retention.md` (`DELETE /api/interviews/:id` hard-erases with cascade)
- Learning loop (roadmap Phase 2): `GET/PUT /api/profile` scoped to the bearer's `caller.userId` (401 without a user session; anonymous/service callers rejected), `user_profiles` table (migration `0004` + CHECKs), `ProfileService`; web client requires sign-in and gates a signed-in user with no profile into onboarding (no anonymous loop). Taxonomy lives in `packages/domain/src/profile.ts`; the client mirror (it cannot import the domain) is `packages/web-client/src/profile-taxonomy.ts` — keep them in sync.
- Learning loop (roadmap Phase 3): server-owned curriculum + per-user skill state. `dsa-interview-curriculum.json` imports to `curricula`/`curriculum_modules`/`curriculum_topics`/`curriculum_topic_problems` (migration `0005`, idempotent re-seed; `problems.topic_id` now set from the catalog topic); `user_skill_states` + `user_curriculum_progress` (CHECKs, cascade with the account; `topic_id` deliberately not FK'd to `curriculum_topics` so a re-seed cannot wipe progress). `CurriculumService`/`SkillService`; `GET /api/curriculum`, `GET /api/curriculum/topics/:id`, `GET /api/skills` (user-session-only, like the profile). Domain: `packages/domain/src/curriculum.ts` + `skill.ts` (mastery scale `not_started→learning→developing→proficient→mastered`, thresholds 1/2/3/3). The client no longer bundles `curriculum.ts` (Progress goes server-backed in Phase 13); mastery *algorithm* is Phase 10/11.
- Learning loop (roadmap Phase 4): server-side recommendation. `Recommendation` entity + deterministic candidate builder + LLM proposal validation in `packages/domain/src/recommendation.ts` (`recommendationType` ∈ `new_topic|continue_topic|reinforce_weakness|review_topic|advance_topic`, statuses `active|accepted|superseded`, sources `llm|fallback`); `RecommendationModel` port + `AzureFoundryRecommendationModel` (server-side Azure AI Foundry chat-completions, `LLM_*` env; credential never in the browser) + `UnconfiguredRecommendationModel`; `RecommendationService` (synchronous generate → validate against the candidate set → supersede prior → persist; **always falls back deterministically** when the model is unconfigured/errors/invalid). `recommendations` table (migration `0006` + CHECKs, cascade with the account; `topic_id`/`problem_id` plain text, not FK'd). APIs `GET /api/recommendations/current`, `POST /api/recommendations`, `POST /api/recommendations/:id/accept` (user-session-only). Local dev needs no LLM: leave `LLM_ENDPOINT`/`LLM_API_KEY` blank and the loop runs on the fallback. Recommendation/evaluation are **backend operations, never realtime tools** (ADR-002).
- Learning loop (roadmap Phase 5): server-backed Dashboard. `packages/web-client/src/dashboard.ts` (pure mappings: preparing-for header, recommendation view, curriculum progress, strengths/weaknesses), `state/use-dashboard.ts` (loads `GET /api/curriculum` + `GET /api/skills` + `GET /api/recommendations/current`, auto-generating the deterministic recommendation when none exists; one shared in-flight load so StrictMode does not double-POST), `screens/DashboardScreen.tsx` rewritten to show profile goal + recommendation card (primary CTA: accept → create interview bound to the recommended problem → briefing), curriculum progress, strengths/focus areas, topic mastery. Client methods `getSkills`/`listCurriculum`. No browser-local authority on the Dashboard; recent-interviews list is deferred to Phase 9's `GET /api/interviews`.
- Learning loop (roadmap Phase 6): Lobby (final pre-interview step; manual Setup retired). `screens/LobbyScreen.tsx` shows the recommendation (type/topic/module/problem/difficulty/objective via `buildRecommendationView`), mic check + session prep, and gates "Begin interview" on mic **and** server voice readiness. Pure gating in `src/lobby.ts` (`sessionReadinessFromVoiceMode` → `unconfigured` blocks Start per audit F8-3; `canBegin` = mic ready && session ready). Shared ritual types in `src/flow.ts` (`SessionPlan`); `BackendClient.getReady()` reads `GET /api/ready` (open probe). `SetupScreen`/`BriefingScreen` deleted; "New practice" routes to the Dashboard recommendation CTA. The persisted `recommendation_id`/`topic_id` linkage stays Phase 9.

Only sources of truth:
- `interview-coach-hld-and-implementation-plan.md` — architecture baseline (2026-09-11), phased plan. Trust it over guesses.
- `docs/implementation-roadmap.md` — **approved target architecture for the personalized learning loop** (phases 1–16), superseding the HLD for recommendation/evaluation/profile/curriculum/skills. Read before starting new work; Phase 1 aligns the HLD/frozen docs to it.
- `dsa-problem-catalog.json` — 59 topics / 300 problems, the canonical problem reference (fields: `title`, `difficulty`, `DSA`, `leetcode`).
- `dsa-interview-curriculum.json` — pedagogical ordering over the same 300 problems (Learn → Practice → Interview Ready → Mastered). Default progression, not a rigid checklist.

Do not invent build/test/lint commands. When scaffolding code, add the runner config first and document the exact commands here.

Frozen architecture: `docs/architecture-frozen.md` (planes, realtime config, tool `call_id` idempotency defaults 8s/2-retries/30min TTL, lifecycle). Changes need an ADR, never silent refactor.
External CLI harness (do NOT duplicate): `/home/pankaj/dev/Projects/InterviewCoachCli` — Phase 0 baseline + realtime regression. Keep backend tool contracts CLI-compatible.
Per-session handoff: `docs/SESSION_HANDOFF.md` (update every session; tag `session-N`).

## Architecture (from HLD — do not re-litigate)

- **Backend owns truth; model owns conversation.** Candidate identity, interview status, problems, scores, evaluation, timestamps, persistence live in the backend. Never let model output become canonical state.
- **Tools are the model/app boundary.** Small domain tools (`get_current_problem`, `get_interview_state`, `get_candidate_performance`, `end_interview`). Never expose generic DB/SQL access.
- **Realtime path stays minimal.** No generic agent framework, custom STT/TTS, or memory system. Per ADR-002 there is **no separate `interview-agent` service** for v1: recommendation, evaluation, skill update, and curriculum are backend application services that call a server-side LLM, with an in-process background job runner (extractable to a worker later). See `docs/implementation-roadmap.md`.
- **Every realtime tool call deduplicates by `call_id`.** One model function call can arrive via multiple Voice Live events; execute once.
- **Azure credentials stay server-side.** Never ship them to the client. API-key mode is local-dev-only.

## Validated realtime config (MVP-proven, reuse as-is)

- Endpoint `https://interview-coach-voice.services.ai.azure.com`, model `gpt-realtime-mini`, API version `2026-04-10`, voice `{ type: "azure-standard", name: "en-US-Andrew:DragonHDLatestNeural" }` (harness sends the `{type,name}` object).
- Audio: PCM16 / 24 kHz / mono both directions. Linux CLI uses `arecord` capture / `aplay` playback.
- `server_vad` (`threshold 0.35`, `speech_duration_ms 80`, `silence_duration_ms 500`, `interrupt_response true`, `create_response true`) — enabled and validated. Server echo cancellation + Azure deep noise suppression are Voice Live capabilities the CLI harness leaves **disabled** (raw mic); the web client adds EC/NS in its own WebAudio path.
- Barge-in path: `speech_started` → `response.cancel` → local playback flush (~4–5 ms). Variable latency is in server VAD detection, not the local flush.
- Keep the CLI as a regression harness even after the web client exists. Test with headphones to avoid assistant-audio mic leakage.
- Logging: lifecycle/timing events only (`speech_started/stopped`, `response_created`, first audio delta, `response.cancel`, playback flush, tool start/complete). Never per-PCM-chunk logging in normal operation.

## Conventions for new code

- Backend owns the interview lifecycle: `created → ready → in_progress ⇄ paused → completing → completed` (+ `cancelled`, `failed`). Model may signal "done"; only the app transitions state.
- Persist interviews, events, responses, evaluation separately from raw conversation. Process restart must not lose authoritative state (HLD Phase 2 exit criterion).
- Follow HLD phase order (domain model → persistence → voice session service → web client → intelligence → code sandbox → hardening → deploy). Don't skip to sandbox/auth/scale prematurely.
