# Session Handoff

## S0 — Bootstrap + frozen docs (2026-09-11)
Status: done (pending verification below).

Done:
* Root `pnpm-workspace.yaml` (`packages/*`), `package.json` (pnpm@12.3.4, node>=20, scripts: dev/build/typecheck/test/lint), `tsconfig.base.json` (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes), `tsconfig.json` (noEmit, empty include).
* `docker-compose.yml` (postgres:16, env-driven), `.env.example` (server-only Azure vars, tool defaults 8s/2 retries/30min, `VITE_BACKEND_URL` only).
* `docs/architecture-frozen.md` (planes, realtime config, tool reliability defaults, lifecycle, stack).
* `packages/.gitkeep` placeholder. No `packages/cli` — external harness at `/home/pankaj/dev/Projects/InterviewCoachCli`.

Decisions locked:
* pnpm + Fastify + Postgres/Drizzle + direct Browser→Voice Live (ephemeral) + in-memory idempotency MVP.

Open for S1:
* Scaffold `packages/domain` (entities + state machine + Result + branded IDs + vitest).
* Add per-package `package.json`/`tsconfig.json` referencing base; extend root `tsconfig.json` include.

Verify: `pnpm install && pnpm typecheck` (S0 exit).
Verified 2026-09-11: `pnpm install` ok (esbuild allowBuilds in pnpm-workspace.yaml), `pnpm typecheck` ok, `pnpm test` 1 passed (s0-smoke), `pnpm build` (`tsc -b`) ok. Toolchain: node v24.21.0, pnpm 12.3.4, typescript 5.9.3, vitest 3.2.7.
Tag: `session-0` after commit.

## S1 — Domain model + backend foundation (2026-09-11)
Status: done (pending verification below).

Done:
* `packages/domain` (`@interview-coach/domain`): pure domain layer, no I/O/HTTP/DB.
  * Primitives: `result.ts` (Result ok/err/map/andThen), `errors.ts` (VALIDATION_ERROR/NOT_FOUND/ILLEGAL_TRANSITION/NO_CURRENT_PROBLEM/CONFLICT), `ids.ts` (branded User/Interview/Problem/Response/Evaluation/Event IDs, `node:crypto` UUIDs + stable `as*` casts).
  * Entities (HLD 1.1): `user.ts`, `problem.ts` (HLD 5.4 shape; catalog-compatible), `interview.ts` (Interview + InterviewConfiguration + InterviewProblem + currentOrder), `candidate-response.ts`, `evaluation.ts` (HLD 5.8 dimensions, 0..5 scores), `interview-event.ts` (append-only lifecycle log).
  * `lifecycle.ts`: frozen transition table (`created → ready → in_progress ⇄ paused → completing → completed` + `cancelled`/`failed`), pure `transition()` stamping startedAt/endedAt.
  * `repositories.ts`: async repo interfaces + in-memory impls (contract for S2 Drizzle swap).
  * `interview-service.ts`: create/ready/start/pause/resume/beginCompleting/complete/cancel/fail + assignProblems/setCurrentProblem/recordResponse/recordEvaluation/getState, clock-injected.
  * `tool-service.ts`: narrow tools `get_current_problem`/`get_interview_state`/`get_candidate_performance`/`end_interview` (model signals done → `completing`, idempotent; `dispatch` logs tool.invoked/tool.failed). `call_id` dedup stays in S3 voice-service.
  * `catalog.ts`: pure `dsa-problem-catalog.json` → Problem import, slug-stable IDs (`prob_<slug>`), per-item errors + duplicate detection.
  * `tests/`: lifecycle (6), interview-service (6), tool-service (7), catalog (4).
* `packages/domain/package.json` (+ `@types/node`, vitest, typescript devDeps), `packages/domain/tsconfig.json` (extends base, noEmit). Root runners unchanged; root `tsconfig.json` include already covers `packages/**/*.ts`.

Decisions locked:
* Repos/services async from day one so S2 Postgres swaps impls without signature churn.
* Tool results are JSON-serializable (ISO timestamps) for future Voice Live `function_call_output`.

Open for S2:
* Drizzle schema + migrations + Postgres-backed repos behind S1 interfaces; process-restart persistence (HLD Phase 2 exit).

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build` (S1 exit).
Verified 2026-09-11: install ok, typecheck ok, test 24 passed (1 s0-smoke + 23 domain), build (`tsc -b`) ok.
Tag: `session-1` after commit.

## S2 — Persistence (2026-09-11)
Status: done (pending verification below).

Done:
* `packages/db` (`@interview-coach/db`): Postgres persistence behind S1 interfaces, same async signatures (InterviewService/ToolService run unchanged).
  * `src/schema.ts`: 7 tables (HLD 5.11) — `users`, `problems`, `interviews` (+ JSON `configuration`), `interview_problems` (ordered assignments, PK `(interview_id, order)`), `candidate_responses`, `evaluations`, `interview_events`. Indexes on all `interview_id`/candidate lookups. No FK `interviews.candidate_id → users` (S1 service accepts arbitrary candidate IDs; auth lands S7).
  * `src/repositories.ts`: `Drizzle*` impls of all 5 S1 repo interfaces + `DrizzleUserRepository` (future auth) + `createDrizzleRepositories()`. `InterviewRepository.save` writes interview row + assignments atomically (`db.transaction`); all saves are upserts (replay/seed-safe).
  * `src/client.ts` (`createDatabase`, `close()` for restart simulation), `src/migrate.ts` (drizzle migrator), `src/seed.ts` (catalog → problems, stable `prob_<slug>` IDs, idempotent).
  * `drizzle/0000_fancy_captain_universe.sql`: initial migration (7 tables).
  * `tests/persistence.test.ts` (3): problem round-trip + `findManyByIds` order, full lifecycle on Postgres repos, close-and-reconnect restart survival (state, responses, evaluation, events all intact; lifecycle advances after restart).
* Driver: `postgres` (postgres-js) + `drizzle-orm`; `drizzle-kit` + `tsx` dev-only.

Decisions locked:
* `findByInterview` returns latest evaluation (S1 in-memory returns first found; single eval per interview in practice).
* Integration tests warn-and-pass without a DB so `pnpm test` stays green; they run for real with Postgres up.
* Local env note: host port 5432 is occupied by a system Postgres 18, so `docker compose up db` runs on 5433 here: `POSTGRES_PORT=5433 docker compose up db`, with `DATABASE_URL=postgresql://coach:coach_dev_only@localhost:5433/interview_coach` for migrate/seed/test. Compose defaults (5432) unchanged.

Open for S3:
* Fastify backend + voice session service + `call_id` idempotency (`POST /api/interviews/:id/tool-exec`, in-memory Map per frozen §5).

Verify: `POSTGRES_PORT=5433 docker compose up -d db && DATABASE_URL=... pnpm --filter @interview-coach/db db:migrate && pnpm install && pnpm typecheck && DATABASE_URL=... pnpm test && pnpm build` (S2 exit).
Verified 2026-09-11: migrate ok, install ok, typecheck ok, test 27 passed (24 prior + 3 persistence, live vs postgres:16), seed 300 problems / 0 skipped (idempotent ×2), build (`tsc -b`) ok. No-DB run: 27 passed with skip warnings.
Tag: `session-2` after commit.

## S3 — Backend + voice session service + call_id idempotency (2026-09-11)
Status: done (pending verification below).

Done:
* `packages/backend` (`@interview-coach/backend`): Fastify product service (HLD Phase 3). `buildApp({repos, config, voiceProvider})` runs on S1 services + S2 Drizzle repos unchanged.
  * Interviews/problems: `GET /api/health`, `POST /api/interviews`, `GET /api/interviews/:id`, `GET /api/interviews/:id/state`, `POST .../ready` (lifecycle needs it; HLD lists start only), `POST .../start`, `POST .../end` (app finalizes to `completed`, idempotent), `POST .../problems` (assign), `GET /api/problems/:id`. JSON error envelope `{ok:false, error:{code,message,retryable}}`; domain codes mapped (400/404/409, permanent); Fastify 4xx (empty/malformed JSON) → 400 envelope, never 500.
  * Tool path: `POST /api/interviews/:id/tool-exec {call_id, tool}` → `ToolService.dispatch` behind generic `IdempotencyStore` (frozen §5: unseen→once, executing→singleflight share, completed/failed-permanent→replay; cross-interview `call_id` → 409 CONFLICT; transient throws NOT stored so retries re-execute; cap 2000, TTL 30 min, 60 s sweep, unref'd). `GET .../tool-results/:call_id` recovery (404 unknown, 409 cross-interview). Permanent failures replay with `retryable:false`.
  * Voice session: `POST /api/interviews/:id/voice-session` (ready→auto-start→`in_progress`, else 409; 404 unknown; 503 `VOICE_NOT_CONFIGURED` when no credential). Returns ephemeral credential + `credentialMode`, `websocketUrl` (CLI-identical builder), frozen VAD/voice/audio config, server-built instructions. `DELETE .../voice-session` clears the in-memory session record (idempotent). Providers: `Unconfigured` (503) / `ApiKeyLocalDev` (explicit `api-key-local-dev` mode) / `Fake` (tests). Entra mint stays behind the provider seam (needs Azure identity infra; S7).
  * Observability: lifecycle/timing logs only via pino (`interview.created/lifecycle`, `tool.received/executed` with elapsedMs+replayed, `voice_session.created/closed`). No bodies/audio. CORS + rate-limit (1000/min; tuning S8).
* `packages/backend/{package.json (fastify@5, @fastify/cors+rate-limit, zod@4, tsx), tsconfig.json}`; `src/{app,config,idempotency,http-errors,serializers,voice-session,server,index}.ts`; `tests/{helpers,interviews,tool-exec,idempotency,voice-session}.test.ts` (31 tests, in-memory repos + fake provider, no DB needed).
* `.env.example`: `HOST`/`PORT`/`CORS_ORIGIN`. `AGENTS.md`: backend runner line.

Decisions locked:
* Tool exec validates interview existence before idempotency lookup; unknown interview → 404 without storing.
* `end_interview` tool stops at `completing` (model signals done); only `POST .../end` completes.
* Voice-session auto-start from `ready` happens before mint, so a 503 still leaves a started interview (client retries mint).

Open for S4 (web client):
* Browser Voice Live client + tool forwarder (8s timeout, 2 retries same `call_id`, sessionStorage rehydration via `tool-results`); heartbeat/disconnect handling for `activeVoiceSessions`.

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build` plus live-DB server smoke (create→assign→ready→voice-session→tool-exec→replay→end_interview→end→cleanup).
Verified 2026-09-11: install ok (+56 pkgs), typecheck ok, test 58 passed (27 prior + 31 backend; live-DB run also 58, persistence live), build (`tsc -b`) ok. Server smoke vs postgres:16 (port 5433) full flow ok: 201/200s, idempotent replay, `api-key-local-dev` mint with correct `wss://.../voice-live/realtime?api-version=2026-04-10&model=gpt-realtime-mini`, no secret leak.
Tag: `session-3` after commit.

## S4 — Web client + browser voice loop (2026-09-11)
Status: done (pending verification below).

Done:
* `packages/web-client` (`@interview-coach/web-client`): Vite + React 19 + TS on `127.0.0.1:5173` (scripts `dev|build|preview|typecheck`). No `VITE_AZURE_*`, no Azure SDK, no `@interview-coach/domain` import (domain pulls `node:crypto`); structural API mirrors only. Root `tsconfig.json` now covers `**/*.tsx` with `jsx: react-jsx` + DOM lib (per-package `tsconfig.json` keeps NodeNext `.js`-suffix imports, which Vite resolves).
* Control plane (`src/api/`, `src/config.ts`): `VITE_BACKEND_URL` only; `BackendClient` maps all S3 routes (create/get/state/ready/start/end/problems/problem/tool-exec/tool-results/voice-session mint+delete). 4xx tool failures return as data (model-facing, never retried); transport/5xx throw retryable `BackendApiError`. Found live: backend 400s bodyless POSTs carrying `Content-Type: application/json` — client omits the header when there is no body (regression-tested).
* Tool forwarder (`src/voice/tool-forwarder.ts`, frozen §5): same `call_id` every attempt, 8s timeout, max 2 retries, 300→800ms+jitter backoff; retry only timeout/network/502/503/504/`retryable:true`, never 4xx/`retryable:false`. `ToolOutputLedger` = exactly-once submitted-set + bounded-20 unacked queue; `pending-store.ts` persists pending ids in sessionStorage (cap 20, corrupt/full-storage safe).
* Voice client (`src/voice/voice-client.ts` + `session.ts` + `audio.ts` + `browser-audio.ts`): CLI-mirrored wire protocol (`session.update` from the mint, `response.create` greeting, `input_audio_buffer.append`, `speech_started`→`response.cancel`+flush once per turn, all four function-call event shapes deduped by `call_id`, output→`conversation.item.create`→`response.create`). Ordered-channel implicit ack (`response.created` acks queued outputs); `recoverPendingOutputs` rehydrates via `GET tool-results` and serves cached outputs only for matching call_ids. Browser auth: credential as query param (`api-key` / `access_token`; bearer browser binding finalizes S7). PCM16/24kHz/mono utils (downmix/resample/base64) tested; WebAudio mic (AudioWorklet, EC+NS) + scheduled playback with `flush()` are thin untested adapters.
* UI (`src/components/`, `src/state/use-interview.ts`, `App.tsx`): setup (create→assign w/ live id validation→ready) → room (status bar: connection/speakers/timer/end; canonical problem panel; local-only code scratchpad marked Phase-6; activity log) → results (backend evaluation or explicit unevaluated state). Hangup DELETEs the voice session; finish = hangup + `POST .../end`.
* `tests/`: backend-client (10), tool-forwarder (12), pending-store (6), audio (9), session (5), voice-client (10).

Decisions locked:
* Session parameters always come from the backend mint (browser maps `sessionConfig` → Voice Live fields); `end_interview` advertised as 4th tool (model signals done, app finalizes).
* No `GET /api/problems` listing in S4 — problem browser + selection intelligence belong to S5; setup validates ids via `GET /api/problems/:id`.

Open for S5 (intelligence/eval):
* Problem selection/config, hint policy, structured context, post-interview evaluation pipeline.

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @interview-coach/web-client build` plus live-DB UI-flow smoke (same calls `BackendClient` makes).
Verified 2026-09-11: install ok (+51 pkgs, react/vite), typecheck ok, test 110 passed (58 prior + 52 web-client), `tsc -b` ok, `vite build` ok (259kB JS / 80kB gzip). Live smoke vs postgres:16 (port 5433) full UI flow ok: create→assign(prob_3sum)→ready→mint(`api-key-local-dev`, correct wss URL, no credential in URL)→state(`in_progress`)→tool-exec→replay→recovery→end_interview(`completing`)→hangup→end(`completed`).
Tag: `session-4` after commit.

## S5a — Interview intelligence, backend half (2026-09-11)
Status: done (pending verification below). Scope per user choice: domain + backend only; web UI (problem browser, hint button, eval form) deferred to S5b.

Done:
* `packages/domain/src/selection.ts`: pure deterministic `selectProblems`/`selectProblemIds` (difficulty filter Easy/Medium/Hard/Mixed, case-insensitive topicFocus over `expectedConcepts`, optional curriculum title-order bias, excludeIds, count clamp 1..20, stable fallback sort).
* `packages/domain/src/hints.ts`: 3-tier controlled hints (`nextHintLevel` caps at 3, `parseHintLevel` strict, `buildHint` templates referencing title/difficulty/concepts, `revealsSolution:false` always, no final code).
* `packages/domain/src/evaluation-pipeline.ts`: `computeOverallScore` (mean 0..5 → 0..100, null when empty), `deriveRecommendation` (85/70/50 bands, one-tier downgrade at ≥3 hints), `finalizeEvaluation` (explicit score/recommendation win).
* `InterviewService.recordEvaluation` now also allows `completed` (post-interview pipeline); new `recordHint` (upserts hintsUsed, appends `hint.issued` event). New event type `hint.issued` (free-text column, no migration).
* `ToolService`: + `get_interview_configuration` / `get_problem_hint` (optional `level` arg, defaults to next tier, records hint) / `record_candidate_answer` (`kind`/`content`≤10k/`problemId` args). `TOOL_NAMES` exported; constructor now takes `evaluations` repo (backend + existing test updated).
* `packages/backend/src/app.ts`: `GET /api/problems` (difficulty/topic/q filters, limit≤100/offset, stable order, `{problems,total,limit,offset}`), `POST .../problems/select` (config-fallback auto-select → `assignProblems`), `POST .../responses` (201 + responseCount), `POST .../evaluation` (finalize pipeline, preserves stored hintsUsed when omitted, 201, works on completed), `tool-exec` accepts optional `arguments` passed to dispatch (idempotency unchanged, failures replayable 4xx).
* `packages/backend/src/voice-session.ts`: `buildSessionInstructions` takes structured context (configuration + problem summaries, response/hint counts) + HLD-5.2 conduct block (hint policy, record answers, config/performance tools, end_interview only when done). Route builds summaries from the snapshot.
* Tests: domain `selection` (6), `hints` (3), `evaluation-pipeline` (4), `tool-service-s5` (6); backend `intelligence` (14: browser/select/responses/eval/tool-args/instructions).

Decisions locked:
* Auto-select falls back to stored configuration field-by-field; empty match set → 400 (not silent single).
* Evaluation finalize preserves accumulated `hintsUsed` when the caller omits it; explicit `overallScore`/`recommendation` are never recomputed.
* `recordEvaluation` on `completed` is intentional (pipeline runs post-interview); earlier statuses still rejected.

Open for S5b (web client):
* Problem browser + auto-select button, hint button (level display), answer capture, evaluation finalize form — all against the S5a routes above; extend `BackendClient` + `ToolName` union then.

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build` plus live-DB intelligence smoke (create→select→ready→mint→hint-tool→responses→config-tool→evaluation→end→evaluation-after-complete).
Verified 2026-09-11: install ok (no new deps), typecheck ok, test 143 passed (110 prior + 33 new: 19 domain + 14 backend; no-DB run warn-and-pass, live-DB run vs postgres:16 port 5433 also 143 with persistence live), `tsc -b` ok. Live smoke full flow ok: 201s, auto-select assigned, mint `test` with hint-aware instructions, hint L1/hintsUsed 1, response recorded, eval computed 80/`lean_hire` (hints preserved), end `completed`, post-complete eval 95/`hire` kept explicit.
Tag: `session-5a` after commit.

## S5b — Interview intelligence, web client (2026-09-11)
Status: done (pending verification below). Takes the design handoff (`design/sd3-ux-handoff`, docs-only — no code to port) where applicable: H-Live hints-left indicator, Results hints header, suggested focus from persisted weaknesses + topic focus. Dimensions render per-key so the spec's "6 bars" vs HLD's 8 needs no client change. Next-practice curriculum link deferred (needs data plumbing; open for S6).

Done:
* Transport (`api/types.ts`, `api/backend-client.ts`): `ToolName` + 3 S5 tools, `ToolArgs`, `toolExec(..., signal?, args?)` → `arguments`; new `listProblems` (query-encoding), `selectProblems`, `recordResponse`, `submitEvaluation`. Fixed `SerializedEvaluation.dimensions` shape (`{score,notes}` objects — was `Record<string,number>`).
* Voice path (`voice/`): `ToolExecutor`/`forwardToolCall` accept `args` (same call_id ⇒ same args every attempt); `voice-client.ts` parses model `arguments` JSON at all four function-call event shapes (`parseToolArgs`, never throws, backend defaults on garbage) and threads them through `pendingCall` → `executeTool` → executor; `use-interview.ts` forwards args to `toolExec`; `session.ts` advertises 7 tools with schemas (hint `level` enum, answer `kind` enum + required `content`).
* Setup (`SetupForm.tsx` + `useInterviewSetup`): problem count + topic-focus fields, auto-select toggle (default on: create → select → ready), manual mode with problem browser (search + difficulty filter over `GET /api/problems`, up to 20 picks) or raw ids.
* Live room (`InterviewRoom.tsx` + new `HintPanel.tsx` + `AnswerForm.tsx`): hint button via `tool-exec` with UI-generated `call_id` (same S5a accounting/idempotency as the model path) + hints-left/tier display; typed answer/note capture via `POST .../responses`; both refresh the snapshot. Exposed `refresh` from `useLiveInterview`.
* Results (`ResultsPanel.tsx` + new `EvaluationForm.tsx`): hints-used header line, per-key dimension rendering, suggested focus; finalize form (8 HLD dims 0–5 optional, strengths/weaknesses) → `POST .../evaluation`, backend computes score/recommendation.
* Tests: `backend-client-s5` (5: query encoding, select/record, eval, args present/absent), `voice-args` (7: parse + forward passthrough); updated `session` (7 tools + schemas) and `voice-client` (7 tools) assertions.

Decisions locked:
* UI hints reuse `tool-exec` (no dedicated hint endpoint); each click is a new `call_id` ⇒ a new counted hint.
* Client renders backend-returned dimension keys verbatim (6-vs-8 question needs no code change either way).

Open for S6:
* Next-practice link into `dsa-interview-curriculum.json` (needs data plumbing to the client).
* Restyle per `docs/ux-spec.md` tokens/components (targets a rebuild, not this package).

Verify: `pnpm typecheck && pnpm test && pnpm build && pnpm --filter @interview-coach/web-client build` plus live-DB UI-flow smoke over real HTTP (same calls `BackendClient` makes).
Verified 2026-09-11: typecheck ok, test 153 passed (143 prior + 10 new; live-DB run vs postgres:16 port 5433 also 153), `tsc -b` ok, `vite build` ok (268.69kB JS / 83.08kB gzip). Live HTTP smoke vs local server + postgres:16 ok: create→select→ready→browse/search→mint(`api-key-local-dev`, instructions-ok)→state(`in_progress`)→ui-hint(L1)→answer(1)→answer-tool(args)→eval(70/`lean_hire`, hints 1)→end(`completed`)→final→delete-session (SMOKE-OK).
Tag: `session-5b` after commit.

## S6 — Web client build per SD3 handoff (2026-09-11)
Status: done (pending verification below). Builds the ux-spec contract (`design/sd3-ux-handoff`, docs-only — no code ported, no merge) on top of the S4/S5b voice+api layer, which is reused unchanged.

Done:
* `src/tokens.css`: all 44 Penpot tokens as CSS vars (`--<name with . → ->`): 19 `color.dark` (voice `#34D399` voice-activity-only, CTA near-white), 13 space/radius/border, 12 type (9 sizes + 3 weights).
* `src/ds/`: 9 components per spec §4 — `PrimaryButton/DangerButton/GhostButton` (`buttons.tsx`), `StatusChip/VoiceState/Timer/Caption/DiffPill/ScoreBar` (`status.tsx`) over pure `model.ts` mappings (icon + label everywhere, timer Low < 5 min). Existing S4 panels (`ProblemPanel/CodeEditor/HintPanel/AnswerForm/EvaluationForm`) reused inside the new layout.
* `src/screens/`: `SetupScreen` (H-Setup: format cards, Easy default, count/topic/auto-select + browser, STEP 1 OF 2) → `DevicesScreen` (H-Devices: mic gate with live level meter blocks Continue, speaker test tone, guided fix on denial, STEP 2 OF 2) → `LobbyScreen` (H-Lobby: config recap + Join) → `LiveScreen` (H-Live hero: topbar brand + chip + timer + guarded End; voice rail with VoiceState + animated wave + captions; H-Live-states inline — reconnect queue note, tab-hidden treated as MicBlocked, barge-in hint; problem → editor locked order; Submit disabled + Phase-6 copy) → `ResultsScreen` (H-Results: per-key ScoreBars, strengths/weaknesses, hints header, timeline, transcript highlights, next-practice curriculum link, finalize form) + `HistoryScreen` (H-History: local top-20 index → backend detail, empty-state + CTA).
* `src/history.ts` (localStorage top-20 index, corrupt/full-storage safe) + `src/curriculum.ts` (bundles `dsa-interview-curriculum.json` read-only, weakness/topic-focus → module suggestion + samples).
* `src/styles.css` rewritten token-only + responsive: `<1100px` rail collapses to a top strip and problem/editor stack (spec §6, rail never unmounts), `<760px` single-column (S6 call). `App.tsx` ritual router (setup→devices→lobby→live→results + history, no dead ends).
* Tests: `ds-model` (10: chip/voice/timer rules), `s6-helpers` (4: history cap/dedup/corrupt, curriculum default + Arrays match).

Decisions locked (spec §9 resolved + §8 trace):
* Q1 focus/keyboard: DOM order rail→problem→editor is the tab order; primary CTAs autofocus; guarded-end dialog focuses safe "Keep going".
* Q2 breakpoints: spec's `<1100px` rail rule + S6's `<760px` single-column stop.
* Q3 guarded-end copy: "closes the voice session and moves the interview to Completing… cannot be undone" (danger End / ghost Keep going).
* Q4 transcript highlights: manual — latest 6 turns verbatim; auto-summaries deferred.
* 6-vs-8 dimensions: render all backend-returned keys (HLD 5.8 = 8 normative; spec's 6 is the subset case) — no client change either way.
* History stays client-indexed (no new backend route in S6); detail always re-fetches canonical `GET .../state`, load failures surface as history errors, never invented state.

Open for S7+:
* `GET /api/interviews` server-side listing (replaces the local history index); transcript persistence for cross-session highlights; sub-760px polish.

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @interview-coach/web-client build` plus preview serve smoke.
Verified 2026-09-11: install ok (no new deps — React/Vite already present), typecheck ok, test 167 passed (153 prior + 14 new), `tsc -b` ok, `vite build` ok (303.43kB JS / 93.52kB gzip — curriculum JSON bundled; 12.35kB CSS with tokens), preview serves `Interview Coach` shell. No `VITE_AZURE_*` in client (one pre-existing comment reference only).
Tag: `session-6` after commit.
