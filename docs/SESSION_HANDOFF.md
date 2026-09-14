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

## S6.1 — Pre-S7 lifecycle gap closure (2026-09-11)
Status: done (verified below). Pre-S7 audit of HLD Phases 0–5 found one real gap: domain `pause/resume/cancel/fail` (S1 `interview-service.ts:86-121`) had no HTTP exposure, leaving `paused`/`cancelled`/`failed` unreachable via the API (sandbox timeouts/cancel paths need them in S7).

Done:
* Backend: `POST /api/interviews/:id/pause|resume|cancel|fail` (`packages/backend/src/app.ts`) — same id-param validation + `{ok:false}` envelope + `interview.lifecycle` pino logs as existing transitions. `cancel`/`fail` take an optional `{reason≤500}` body; bodyless POSTs (no content-type, per S4 note) mean "no reason", malformed reasons → 400. Model never calls these (app-only, like `end`).
* Web client: `pauseInterview/resumeInterview/cancelInterview/failInterview` on `BackendClient` (body omitted when no reason). No UI wiring yet — S7 decides where pause/cancel surface.
* `docs/architecture-frozen.md` §9 phase→session mapping corrected (was stale: S3–S5/S6/S7; now S3/S4/S6-rebuild/S5a+b/S7-sandbox/S8).
* Backend `interviews.test.ts`: +5 tests (pause→resume round-trip, pause-while-created 409, cancel-with-reason, bodyless fail, malformed reason 400).

Deliberately deferred (not pre-S7 blockers, stay open for S7+):
* `GET /api/interviews` server listing — not in HLD §1.3 API; local history index stands until S7+ decides.
* Transcript persistence — voice transcripts stay ephemeral per architecture principle 8 (conversation history ≠ app state); canonical eval input is `POST .../responses` + `record_candidate_answer` (already persisted). S7 eval integration builds on that.
* Entra ephemeral mint — local-dev api-key mode suffices until deploy track (S8).

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build` (no-DB warn-and-pass 172 + live-DB vs postgres:16 port 5433 172) plus live server smoke.
Verified 2026-09-11: install ok, typecheck ok, test 172 passed (167 prior + 5 new), `tsc -b` ok. Live smoke vs postgres:16 ok: create→ready→start→pause(`paused`)→resume(`in_progress`)→fail(`failed`, reason)→cancel second interview bodyless (`cancelled`).
Tag: `session-6-1` after commit.

## S7 — Code execution sandbox (HLD Phase 6, open)

## S7a — Sandbox backend half: domain + persistence + local runner (2026-09-11)
Status: done (verified below). Scope per user choice: local-runner MVP + backend half; web UI (submit editor, run panel, eval scoring over runs) deferred to S7b. Voice tools are live so the model path works end-to-end already.

Done:
* Domain (`packages/domain/src/submission.ts` + `submission-service.ts`): `CodeSubmission`/`CodeRun` entities (`sub_`/`run_` ids), `createSubmission` (javascript|python, ≤50k chars), `parseTestCases` (1..50, unique names, JSON-only, hidden flag), `parseRunLimits` (100ms..30s, 5s default), `CodeExecutor` port, `assembleRun` (hidden actuals masked, timeout/error passthrough), `summarizeRun` (passRate). `SubmissionService` (submit/list/latest/run/listRuns/summary, live-status gating, runner crashes → persisted `error` runs). Events `code.submitted`/`code.executed`. Repos + in-memory impls added to `RepositorySet`.
* `ToolService`: + `submit_solution` / `run_code` (latest-or-named submission; timeout/error are results, not dispatch failures); `get_candidate_performance` += `submissionCount`/`lastRunStatus`. Constructor takes `submissions` (existing domain tests updated).
* DB: `submissions` + `code_runs` tables (`drizzle/0001_short_meteorite.sql`, migrated), Drizzle repos + factory, persistence test (submit→run→restart survival).
* Backend: `LocalCodeRunner` (`src/code-runner.ts` — fresh temp dir per run, node/python3 `solve(*args)` harness, canonical compare, wall-clock kill → `timeout`, output caps; documented local-dev-only, containers in S8). Routes `POST/GET .../submissions`, `POST .../submissions/:subId/runs`, `GET .../runs[/:runId]` (cross-interview → 404, verdicts always 201-never-5xx). Config `CODE_RUN_TIMEOUT_MS`/`CODE_RUN_MAX_OUTPUT_CHARS` (+ `.env.example`). Voice instructions advertise submit/run tools + `Code:` progress line on the mint.
* Tests: domain `sandbox` (7), `submission-service` (5), `tool-service-s7` (3); backend `sandbox` (12: real JS+Python pass, wrong-code fail + hidden masking, load-error, 500ms-timeout kill, cross-interview 404, runs list/fetch, tool-exec submit/run/perf, instructions); db +1 persistence.

Decisions locked:
* Hidden cases report pass/fail only end-to-end (masked at assembly, never stored).
* Scoring policy over runs stays open for S7b; S7a persists + surfaces summaries (performance tool, mint context).
* `submit`/`run` allowed in ready/in_progress/paused/completing (cancelled/failed/completed/created rejected).

Open for S7b (web client):
* Submit editor + run panel against the S7a routes above; extend `BackendClient` + advertise 9 tools in `voice/session.ts`; evaluation scoring over execution summaries.

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build && vite build` (no-DB warn-and-pass 214 + live-DB vs postgres:16 port 5433 214) plus live server smoke.
Verified 2026-09-11: install ok, typecheck ok, test 214 passed (172 prior + 42 new), `tsc -b` ok, `vite build` ok (303.97kB JS / 93.61kB gzip). Live smoke vs postgres:16 ok: create→ready→start→submit(python)→run passed 2/2 hidden-masked→runs list→performance(submissions 1, lastRun passed).
Tag: `session-7a` after commit.

## S7b — Sandbox web client: submit editor, run panel, execution debrief (2026-09-11)
Status: done (verified below). Closes the S7a open items: `BackendClient` covers all five sandbox routes, `session.ts` advertises 9 tools, the live room runs the real sandbox, and Results shows execution evidence for scoring.

Done:
* Transport (`api/types.ts`, `api/backend-client.ts`): `submit_solution`/`run_code` added to `ToolName`; `CodeLanguage`/`SubmitCodeInput`/`SerializedSubmission`/`TestCaseInput`/`RunCodeInput`/`SerializedTestResult`/`RunStatus`/`SerializedRun` mirrors; `submitCode/listSubmissions/runSubmission/listRuns/getRun` methods.
* Voice path (`voice/session.ts`, `voice/voice-client.ts`): `submit_solution` (required language+code) + `run_code` (required testCases) definitions with schemas; `VALID_TOOL_NAMES` accepts both. No forwarder/client logic change needed — `parseToolArgs` threading from S5b carries the new args untouched.
* Live room (`components/CodePanel.tsx`, `screens/LiveScreen.tsx`): language-restricted editor (python/javascript only — the only executed languages) with `solve(...)` contract hint; submit → backend-owned state with activity-log + snapshot refresh; editable case table (name/args-JSON/expected-JSON/hidden, add/remove) with pure `parseEditableCase` validation; timeout override (blank = 5s default); run verdicts with per-case pass/fail. Legacy `InterviewRoom` swapped to the same panel (its `ResultsPanel` path untouched); stale "Phase 6" placeholder copy gone.
* Results (`components/ExecutionPanel.tsx`, `screens/ResultsScreen.tsx`): read-only execution card (submission count, latest run status/counts/duration, per-case verdicts, hidden-masked) mounted above the finalize form so evaluators score with execution evidence in view. Scoring itself stays human/backend-owned — no client-side grading.
* Tests: `backend-client-s7` (2: submit/list, run/list/get incl. URL shapes), `code-panel` (5: case parsing, name defaulting, JSON/array errors, run summary); updated `session` (9 tools + S7a schemas) and `voice-client` (9 tools) assertions.

Decisions locked:
* UI submits only javascript/python (backend rejects the rest anyway; the old 5-language scratchpad picker overstated support).
* Blank case names default to `case_N` client-side; backend uniqueness still enforced server-side.
* `ExecutionPanel` fetches on mount (submissions + runs in parallel); load failures surface as panel errors, never invented state.

Verify: `pnpm typecheck && pnpm test && pnpm build && vite build` (no-DB warn-and-pass 222 + live-DB vs postgres:16 port 5433 222) plus live server smoke.
Verified 2026-09-11: install ok, typecheck ok, test 222 passed (214 prior + 8 new), `tsc -b` ok, `vite build` ok (310.86kB JS / 95.45kB gzip). Live smoke vs postgres:16 ok: submit(JS)→run passed 2/2 hidden-masked→runs list/get→submissions list→mint(`api-key-local-dev`, tools-in-instructions, `Code: 1 submission, not run yet`, correct wss URL, no secret leak)→tool-exec submit(python)→run latest(passed 1/1). Voice-session 503 without credential confirmed correct (`VOICE_NOT_CONFIGURED`, retryable false).
Tag: `session-7b` after commit.

## S8 — Hardening + deploy (HLD Phases 7–8, open)

## S8a — Service hardening: auth gate, real rate limits, quotas, probes/metrics (2026-09-11)
Status: done (verified below). Scope per user choice: hardening first; containers/CI/deploy track (S8b) later.

Done:
* Auth gate (`packages/backend/src/auth.ts`): optional `API_AUTH_TOKEN` bearer. When set, all `/api/*` except `GET /api/health|ready` 401 (`UNAUTHORIZED`, permanent) without `Authorization: Bearer`; unset = open local-dev mode + one startup warn. Timing-safe compare. Per-user ownership stays out (needs Entra/OIDC identity → S8b + ADR, documented in the module header).
* Rate limits (`packages/backend/src/rate-limit.ts`, owned fixed-window per-IP): global 1000/min + tighter tool-exec 120 / voice-mint 60 / code-run 30 per min (env-overridable). 429s use the shared `{ok:false}` envelope with `RATE_LIMITED`/`retryable:true` + `Retry-After`, so the browser forwarder backs off with the same `call_id`. Health/ready probes exempt.
* Quotas: `VOICE_MAX_ACTIVE_SESSIONS` 200 (429 past it), `CODE_RUN_MAX_CONCURRENT` 4 (in-process semaphore, 429 past it), `CODE_RUN_MAX_SUBMISSIONS_PER_INTERVIEW` 100 (429 past it). Explicit 256KB body cap (413 before domain logic).
* Probes/observability: `GET /api/ready` (repo ping → 503 `NOT_READY` when the DB is down; reports voice mode + session count), `GET /api/metrics` (auth-gated; interviews/tools+replays+failures/voice minted+rejected/code runs by status/submissions/sessions/idempotency size, uptime). Counters wired into create/tool-exec/voice-mint/submit/run paths. `GET /api/health` unchanged and open.
* Headers: `@fastify/helmet` (nosniff/frameguard/hsts/csp verified live).
* Web client: `BackendClient` optional bearer (`VITE_API_TOKEN`, local-dev-only like the api-key voice precedent) on control-plane + tool-exec paths; `loadWebConfig().apiToken`; wired in `useBackendClient`. No new `VITE_AZURE_*` (bundle still clean — only the pre-existing guard comment).
* Tests: backend `hardening.test.ts` (10: auth open/gated, metrics counting incl. replay + rejection, session/submission caps, tool-exec 429 envelope, 413 body cap, helmet header, secret non-leak in 404/503); web `backend-client-s8.test.ts` (3: header absent by default, present on both paths, env parsing).

Audit findings (fixed in S8a, no ADR — additive, no plane change):
* `@fastify/rate-limit` removed: `void app.register(rateLimit)` never limited anything — the plugin installs budgets via an `onRoute` hook at plugin-execution time (deferred to `ready()`), but buildApp adds all routes synchronously first, so the hook missed every route (proven: a max-2 budget never fired). The S3 "1000/min" was a no-op. Owned root `onRequest` limiter installs synchronously; every budget is test-covered.
* Secret hygiene verified: server log + error bodies contain no voice key; bundle has no `VITE_AZURE_*` values.

Decisions locked:
* 401s are permanent (`retryable:false`); 429s are retryable (`retryable:true`) across auth/quota/rate-limit paths alike.
* Rate limiting runs before auth (token brute-forcing is throttled); probes stay open for load-balancer/K8s checks.
* Container isolation for the sandbox stays S8b (quotas here are defense-in-depth, not a security boundary).

Open for S8b (deploy track):
* Dockerfiles + compose (backend/web/db), CI (test→build→security), Entra/OIDC user identity + per-interview authz, Prometheus exporter over the metrics shape, retention/deletion policy (HLD 7.4).

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build && vite build` (no-DB warn-and-pass 235 + live-DB vs postgres:16 port 5433 235) plus live server smoke with `API_AUTH_TOKEN` set.
Verified 2026-09-11: install ok (+helmet, −rate-limit), typecheck ok, test 235 passed (222 prior + 13 new), `tsc -b` ok, `vite build` ok (311.31kB JS / 95.60kB gzip). Live smoke vs postgres:16 (port 5433, port 3210 server, token-gated + `api-key-local-dev` voice): health/ready open; create without token 401; full flow with token create→ready→mint (correct wss URL)→tool-exec→replay(`replayed:true`)→metrics(interviews 1, exec 1, replay 1, minted 1, sessions 1)→helmet headers present→hangup→end(`completed`, idempotent). Server log + error bodies: no key leak. Note: smoke server left running on 127.0.0.1:3210 (shell tool blocks kill) — stop with `pkill -f "tsx watch"`.
Tag: `session-8a` after commit.

## S8b — Deploy platform: retention, Prometheus, containers, CI (2026-09-11)
Status: done (verified below). Scope per user choice: platform first; Entra/OIDC identity + per-interview authz deferred to S8c.

Done:
* Retention (HLD 7.4): `InterviewRepository.deleteById` (in-memory + Drizzle `delete … returning`) + `InterviewService.deleteInterview` (any state except live `in_progress`/`paused` → 409 "end/cancel/fail first"; returns pre-delete status) + `DELETE /api/interviews/:id` (auth-gated, clears the voice-session record, `interview.deleted` audit log, `interviewsDeleted` counter). Postgres `ON DELETE CASCADE` erases assignments/responses/evaluations/events/submissions/runs; catalog survives. Policy in `docs/data-retention.md` (stores/lifetimes, erasure semantics, encryption-at-rest/TLS deployment notes, no auto-backup in S8b).
* Prometheus: `GET /api/metrics/prometheus` (auth-gated, `text/plain; version=0.0.4`), hand-rolled renderer over the same snapshot (`*_total` counters incl. per-status `code_runs_total{status}`, uptime/sessions/idempotency gauges). Series names locked (additive-only going forward).
* Containers: `packages/backend/Dockerfile` (node:24-slim, prod-only install, non-root, boot-migrates, `/api/ready` healthcheck; tsx promoted to runtime deps in backend+db since the repo runs source — no emit infra) + `packages/web-client/Dockerfile` (build stage + nginx:alpine, SPA fallback, immutable `/assets` caching, API not proxied) + `.dockerignore` + `nginx.conf`. Compose gains `backend` (migrates on boot, `HOST 0.0.0.0`, `DATABASE_URL` at `db:5432`, db health-gated) + `web` (`:8080`, `VITE_BACKEND_URL` build-arg); seed stays an explicit one-off (`docker compose run --rm backend … db:seed`).
* CI (`.github/workflows/ci.yml`): typecheck → migrate → live-Postgres tests → builds → bundle secret scans (no `VITE_AZURE_*=` values / voice key / `sk-` tokens in `dist/assets/*.js`; backend never references `VITE_`) → backend+web `docker build` → compose boot probe (`/api/ready` + prometheus scrape) → always-teardown.
* `AGENTS.md`: S8a/S8b runner lines (quotas/probes, compose/CI/retention).
* Tests: domain `interview-service` (+2: delete finished/live-refusal), db `persistence` (+1: full cascade incl. shared-catalog survival), backend `hardening` (+4: delete flow + metrics count + live-409 + session clear, prometheus shape + auth gate).

Verified 2026-09-11: install ok (tsx→deps), typecheck ok, test 242 passed (235 prior + 7 new; no-DB warn-and-pass and live-DB vs postgres:16 port 5433 both 242), `tsc -b` ok, `vite build` ok. Images build clean (backend required no fix; web needed root `tsconfig.base.json` + curriculum JSON in build context — both fixed in-Dockerfile). Compose smoke (ports remapped: backend 3121, web 8091, pg 5433 — host 3000/3100/3210 already bound): backend healthy, boot-migrated, seed 300/0, create→ready→select→voice-503 (correct, no credential)→prometheus scrape→end→delete→web 200 + SPA fallback — all ok (SMOKE-OK). Stack torn down after.
Open for S8c: Entra/OIDC identity + per-interview authz (+ADR), Prometheus scrape config/alerts, managed TLS/backups.
Tag: `session-8b` after commit.

## S8c — Local user accounts + per-interview ownership (2026-09-11)
Status: done (verified below). Scope per user decision: self-registered email+password now; social (Google/GitHub/Microsoft) in Prod/S8d; local dev stays open mode. Design recorded in `docs/adr-001-user-auth.md`.

Done:
* Domain: `User` += normalized `email` (+`normalizeEmail`/`validEmail`); new `UserAccount`/`UserSession` shapes + `sessionExpired`; `UserRepository`/`SessionRepository` contracts + in-memory impls; `RepositorySet` += `users`/`sessions`.
* DB: migration `0002` (`users.email` unique + `password_hash` nullable for pre-S8c rows, `user_sessions` with cascade + index); `DrizzleUserRepository`/`DrizzleSessionRepository` behind the domain contracts; factory extended. Pre-S8c credential-less rows are invisible to auth flows.
* Backend (`src/users.ts`): scrypt passwords (N=16384/r=8/p=1, versioned format, timing-safe verify), 32-byte session tokens stored as SHA-256 (raw shown once, never logged/stored); `UserService.register/login/logout/resolveSession` (duplicate → 409, unknown/wrong → indistinguishable 401, expired/orphaned sessions lazily revoked). Routes `POST /api/auth/register|login|logout` (register/login open without bearer; strict `auth` rate bucket 10/min). Caller model: service token bypasses (CLI/admin), user sessions scope every `/api/interviews/:id…` route to own `candidateId` (foreign reads 404, no oracle), create stamps identity from the session (body spoof ignored), anonymous works only in open mode. Auth lifecycle logs carry user id only; counters `authRegistrations/Logins/Failures` in JSON + Prometheus.
* Client: `BackendClient.register/login/logout`, `auth-store.ts` (localStorage-backed session, corrupt-safe, memory fallback for tests), `useBackendClient` prefers the signed-in token, `AuthPanel` on the setup screen (sign-in optional; anonymous flow unchanged).
* Tests: domain `user` (4), backend `users` (8: hashing, register/login/logout, dup+uniform-401s, email/hash hygiene, ownership incl. spoof-override + service bypass + open-mode compat, expiry cleanup), client `backend-client-s8c` (5: endpoint shapes, error surfacing, store set/clear/corrupt).
* `.env.example`: `RATE_LIMIT_AUTH_PER_MIN=10`, `AUTH_SESSION_TTL_HOURS=720`; retention doc covers account/session rows; S8d owns full account erasure + social.

Verify: typecheck + test 258 (242 prior + 16 new; no-DB warn-and-pass and live-DB vs postgres:16 port 5433 both 258) + `tsc -b` + `vite build` (314.45kB JS / 96.60kB gzip).
Verified 2026-09-11: all green. Live smoke vs postgres:16 (port 3220 server, open mode): register (email normalized) → dup 409 → wrong-pw 401 → owned create (spoof ignored) → cross-user 404 → anonymous 200 → logout + reuse 401 → prometheus auth series correct → delete ok. Server log: zero password/token hits. Note: smoke server left on 127.0.0.1:3220 (shell tool blocks kill) — stop with `pkill -f "tsx watch"`.
Open for S8d (with user-created resources): Entra/social as second issuer over the same session rows, per-user authz hardening, account erasure, scrape config/alerts.
Tag: `session-8c` after commit.

## S8d — Prod identity + prod voice + account erasure (PARKED, open)
Status: parked per user decision (2026-09-11). Local accounts (S8c) are the auth for now; social + Entra voice are prod-only and wait for user-created resources. No code started; design seam is ready (ADR-001 §4: social arrives as a second issuer minting the same `user_sessions` rows — no route changes).

User prerequisites (nothing for the agent to guess; ask for these when unparking):
* Provider app registrations (each with backend callback `https://<BACKEND>/api/auth/<provider>/callback` + localhost equivalents):
  * Google (console.cloud.google.com): OAuth client (Web), scopes `openid profile email` → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
  * GitHub (Settings → Developer settings → OAuth Apps): callback URL set → `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (runtime scopes `read:user user:email`).
  * Microsoft (entra.microsoft.com): "Accounts in any org + personal" (social), Web platform + ID tokens → `MICROSOFT_TENANT_ID` (`common` or tenant GUID) / `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`.
  * Decisions: same-email-across-providers links one account (recommended yes); account deletion = user row + sessions + all owned interviews (recommended yes); `BACKEND_PUBLIC_URL` value.
* Prod voice (only for internet-facing voice; local dev stays on `AZURE_VOICE_API_KEY` api-key mode): confirm `interview-coach-voice` resource + `gpt-realtime-mini` deployment still exists; backend hosting decision (Azure → managed identity + role on the voice resource; off-Azure → Entra SP `TENANT_ID/CLIENT_ID/CLIENT_SECRET`); then implement Entra ephemeral mint behind the existing provider seam (mint URL deliberately unguessed) + one live browser-connect test.
* Secrets travel via env only (never commit); add prod URLs as extra redirect URIs alongside localhost.

Agent scope when unparked:
* `GET /api/auth/:provider/start` + `GET /api/auth/:provider/callback` (google/github/microsoft), find-or-create `users` by normalized email, mint `user_sessions`; `DELETE /api/auth/account` (user row + sessions + owned interviews via existing cascade); client provider buttons + account panel delete; Prometheus scrape config/alerts; managed TLS/backup notes.
* Tests: issuer unit (state/nonce, code exchange fake), linking (same-email), account erasure cascade, voice ephemeral mint fake + live connect note.

## Phase 9 — Product expansion (UNSTARTED, open)
Status: untouched. Per HLD, only after DSA voice interviews are stable in prod.
* Candidate tracks: System Design, Behavioral, Backend, Frontend, ML, Resume-based, Company-specific — all on the shared realtime foundation (frozen planes, tool `call_id` contract, lifecycle unchanged).
* No design, no code, no migration started. When starting, open a `Phase 9` handoff section with track scope + eval-dimensions delta + problem-repository additions; never relitigate frozen sections without an ADR.

## UX — Spec-first redesign + web-client rebuild (2026-09-13)
Status: done (verified below). Trigger: `docs/audit/ux-conformance.md` found the shipped client was an engineer's tool, not the spec's practice environment. User directive: UI spec is **normative over the HLD**; design the whole surface in Penpot, then rebuild the client so no further UI work is needed.

Design (Penpot):
* New page `03 — Hi-Fi v2 (UI Spec)` in the connected file — 21 boards covering every UI-spec section: Cover/index, Flow §43, Dashboard §4, New-Interview §5–§7, Briefing §8, Live §9–§19, Live-States §12, Coaching §18, Text-Mode §16, End-Dialog §20, Evaluating §21, Results §22–§23, Feedback-Detail §24, Transcript §25, History §26, Progress §27–§28, Weak-Areas §29, Settings §30, Mobile-Live/Results §34, Components-v2. Reuses the existing tokens + component library; pages 01/02 untouched.

Client rebuild (`packages/web-client`):
* Design system: `ds/model.ts` voice phases now Connecting/Listening/You're speaking/Thinking/Interviewer speaking/Paused/Muted/Error (candidate-speaking no longer discarded); new `ds/primitives.tsx` (Card/Eyebrow/Pill/Segmented/RadioCard/ProgressChecklist/Wave/Dialog/StatCard/ScoreRow/Field); `ds/status.tsx` VoiceState takes muted/paused.
* Shell + routing: new `components/AppShell.tsx` (top bar + sidebar nav); `App.tsx` split into nav views (Dashboard/History/Progress/Settings) and the standalone ritual (Setup → Devices → Briefing → Live → Evaluating → Results → Feedback/Transcript/Weak areas).
* Screens: Dashboard, Setup (type/difficulty/style/interaction/duration), Briefing, Live (conversation-first + progress checklist + problem/code + optional coaching + text-fallback composer + mute/pause/transcript controls + end dialog), Evaluating, Results (score hero + spec §23 dimension labels + review/practice CTAs), Feedback-Detail, Transcript-Review, History (search/filter/date groups), Progress (trend chart), Weak-Areas, Settings.
* State: `useLiveInterview` gains mute/pause/rejoin-on-drop/text input; `voice-client` emits assistant transcripts + `sendTextMessage`; `history.ts` stores richer entries (type/difficulty/mode/duration/score/dimensions/weaknesses); new `progress.ts` derives trend/areas; `dimensions.ts` maps HLD keys → spec §23 labels.
* Difficulty enum unified to `Easy|Medium|Hard|Mixed` (domain `InterviewDifficulty`, backend `configurationSchema`) — closes audit F1/C4-7/I5-2 so the spec's "Hard" is selectable.
* Removed dead S4 components (InterviewRoom/ResultsPanel/SetupForm/CodeEditor/StatusBar/LobbyScreen).

Verify (2026-09-13): `pnpm typecheck` ok; `pnpm test` 277 passed (36 prior files + new `render-smoke.test.tsx` 15 screen-render checks; `ds-model` extended for the new voice phases); `tsc -b` ok; `vite build` ok (323kB JS / 98kB gzip, 22.5kB CSS).
Known client-side gaps (backend-bound, not UI): auto-evaluation/scoring-over-runs (F6-2/I5-1) still requires the manual finalize form; History/Progress are browser-local (no listing endpoint); multi-problem progression (F2/I5-3) still single-problem.
Tag: `session-ux` after commit.

## Audit remediation P1–P8 (2026-09-13)
Status: done (verified below). User directive: work the build-phase audits in order, fixing the backend to support the frozen front-end and the product decisions; only advance when a phase is fully fixed. P0 (freeze) is out of scope.

Commits (one per phase):
* `8ed71dc` P1/P2 — domain + persistence. P1: F2 progression (completeCurrentProblem/skipProblem), F3 empty assignment, F4 runtime config validation, F5 shared response cap, F6 unknown dimension keys, F7 latest evaluation, F8 exhaustive dispatch, F10 recordResponse returns {interview,response}. P2: P2-2 duplicate assign ids, P2-3 deterministic ordering, P2-4 stable problem list, P2-5 migration 0003 CHECK constraints, P2-6 transactional read, P2-8 timestamp preservation; P2-1 single-writer documented (CAS deferred); P2-7 event log documented.
* `aea3af2` P3 — voice session. V3-1 TTL sweep, V3-2 singleflight binding, V3-3 call_id→(interview,tool) binding, V3-4 start only after mint, V3-5 api-key prod guard; F8-4 unconfigured voiceMode.
* `be1a25a` P4 — web client. C4-2 retryable:true honored, C4-3 pagehide release, C4-5 timer wall-clock, C4-6 status chip; C4-1/4/7 already fixed by the redesign, C4-8 moot (single-problem UI).
* `dc6e81b` P5 — intelligence. I5-1 downgrade fires on the omitted-hintsUsed path, I5-4 hasEvaluation needs a scored dimension, I5-5 dead type arm dropped, I5-6 voice schema problemId, I5-7 hints running-only.
* `51ec9e2` P6 — sandbox. F6-1 env scrub + privilege drop + heap cap + prod gate, F6-3 quotas in SubmissionService (+ transient 429), F6-4 tool-path timeout cap, F6-5 NaN/Infinity canon, F6-6 problemId validation. F6-2 deferred (scoring model is an open product decision, §17).
* `45c985e` P7 — security. F7-1 scrypt N=2^15 + v2 format, F7-2 lockout, F7-3 7-day TTL, F7-4/F8-2 prod auth fail-safe, F7-5 digest compare, F7-6 documented.
* `ba24121` P8 — deployment. F8-6 process-level NODE_ENV, F8-7 lifecycle/eval metrics, F8-10 web boot probe, `docs/deployment.md` (F8-1/F8-3/F8-5/F8-8/F8-9 + realtime note).

Deferred / known-open (by product decision or external dependency, not silently dropped):
* F6-2 scoring over run verdicts — product scoring model is explicitly open (`product-decisions.md` §17).
* F8-1 full container isolation — runner is prod-gated off by default; a dedicated no-network sandbox service is the follow-up.
* F8-3 Entra ephemeral voice mint — parked S8d (needs Azure resources); compose remains a voice-less demo.
* F8-5 registry push/deploy target — no registry yet; manual release process documented.
* F7-2 password reset/verification — needs a mail transport (S8d account management).
* P2-1 CAS — single-writer MVP documented; shared-state promotion is the multi-instance follow-up.

Verify (2026-09-13): `pnpm typecheck` ok; `pnpm test` 305 passed (37 files, incl. live-Postgres persistence with migration 0003 applied on 5433); `tsc -b` ok; `vite build` ok. New tests cover P1 (progression/validation/caps/ordering), P3 (idempotency binding, TTL sweep, prod voice guard), P4 (retryable 429), P5 (downgrade), P6 (env scrub, NaN, prod gate, caps, problemId), P7 (lockout, prod auth fail-safe), P8 (lifecycle metrics).

## Learning-loop architecture (approved, NOT implemented) — 2026-09-14
Status: architecture approved; **Phase 1 (docs alignment) complete**; implementation of Phases 2–16 **not started**. The product owner specified the target architecture in 15 parts and resolved all open decisions. The consolidated roadmap lives in **`docs/implementation-roadmap.md`** (read it first). Phases 1–16, dependency-ordered; Phase 16 is integration only.

Locked decisions (summary; full text in the roadmap):
* Two LLM surfaces: Azure Voice Live (realtime interview, unchanged) vs a **separate server-side Azure AI Foundry text deployment** for recommendation/evaluation, behind `RecommendationModel`/`EvaluationModel` interfaces. Prod auth = Managed Identity/Entra; local dev may use an API key; credential never in the browser.
* Recommendation = **synchronous**; evaluation = **asynchronous** (interview completes immediately; background job; UI `evaluation_in_progress`). No `interview-agent` service; keep the job abstraction so it can be a separate worker later.
* Evaluation dimensions (DSA v1, canonical snake_case): `problem_understanding, approach, communication, coding, testing_debugging, complexity_analysis, independence`. Backend derives `overallScore`/success/mastery; the old "≥3 hints = downgrade" rule is **removed**.
* Per-topic mastery scale `not_started→learning→developing→proficient→mastered`, configurable thresholds (defaults: 2→developing, 3→proficient, 3→mastered); a "successful attempt" is decided by the LLM evaluation.
* Canonical realtime tools: `get_current_interview`, `get_current_problem`, `submit_interview_data`, `end_interview` (existing names remain deprecated aliases for the CLI harness). Recommendation/evaluation are backend operations, never tools.
* Transcript = backend-canonical, forwarded by the browser from realtime events; structured only, no raw audio; retention configurable; PII kept out of logs.
* No anonymous learning loop: sign-in required; remove "Continue as guest" from the loop (landing/sign-in only). Onboarding required + editable; taxonomy as domain config.
* New HLD principle to add in Phase 1: **"The LLM is not the system of record."**

Two micro-items were resolved (2026-09-14): (1) the realtime tool surface is exactly `get_current_interview`, `get_current_problem`, `submit_interview_data`, `end_interview` (hints are conversational; code execution stays the client HTTP path; old names are deprecated aliases); (2) mastery scale `not_started→learning→developing→proficient→mastered` with thresholds 1/2/3/3.

Phase 1 done (2026-09-14): HLD amended (target arch, §5.2/§5.4/§5.5/§5.8/§5.11, new §5.13–§5.18, §6, §7.2, §9, Phase 9 added / old Phase 9 → 10, §11, §14, §15, §16); `docs/architecture-frozen.md` §2/§8/§9 amended; `docs/adr-002-recommendation-evaluation-llm.md` created; `docs/interview-coach-product-decisions.md` §17 resolved + taxonomy + §18 principles; `docs/implementation-roadmap.md` micro-items resolved.

Next step when work resumes: **Phase 2 — User profile / onboarding**. Do not implement recommendation/evaluation as realtime tools; follow the roadmap's locked decisions.
Tag: `session-roadmap` after commit.

## Phase 2 — User profile / onboarding (2026-09-14)
Status: done (verified below). Roadmap Phase 2, sub-phases 2.1–2.6. First step of the learning loop: server-owned `UserProfile` + required first-run onboarding. No LLM/voice work (per roadmap).

Done:
* Domain (`packages/domain/src/profile.ts`; `repositories.ts`/`index.ts`): `UserProfile` (`userId`, `interviewTypes[]`, `role`, `level`, `goals?`, timestamps); taxonomy as domain config (`INTERVIEW_TYPES`/`PROFILE_ROLES`/`PROFILE_LEVELS` + label maps + guards); `createUserProfile`/`updateUserProfile` (non-empty/deduped interview types, taxonomy membership, goals trim/cap 500; edit preserves identity + createdAt). `UserProfileRepository` contract + in-memory impl; `RepositorySet.profiles`.
* DB (`packages/db`): `user_profiles` table (PK `user_id` FK→`users` cascade, JSONB `interview_types`, `role`/`level` text, `goals` nullable) + `DrizzleUserProfileRepository` (upsert, preserves `createdAt`). Migration `0004_nice_wendell_rand.sql` + CHECK constraints (role/level enums, non-empty `interview_types` array, goals ≤500). `truncateAll` extended.
* Backend (`packages/backend/src/profile.ts`; `app.ts`/`serializers.ts`/`metrics.ts`/`prometheus.ts`): `ProfileService.get/upsert`; `GET /api/profile` (returns `profile:null` before onboarding) + `PUT /api/profile`, both scoped to `caller.userId` and 401 for anonymous/service callers (profile is per-user; a service token has no user id); zod shape + domain re-validation; `serializeUserProfile`; `profile.updated` log + `profilesUpdated` counter/Prometheus series.
* Web client: `BackendClient.getProfile/putProfile` + `SerializedUserProfile`/`ProfileInput`; `profile-taxonomy.ts` (single client mirror); `ProfileForm` (shared create/edit); `OnboardingScreen` (required, no cancel); `ProfileScreen` rewritten (identity props + server profile summary + inline edit); App first-run gate (signed-out → sign-in/sign-up only; signed-in without profile → onboarding; profile fetch on session change, 401 clears the session, retryable error state). Removed the guest path from the loop (SignIn/CreateAccount `onGuest` + buttons, `SetupScreen` "Guest" fallback, `AccountSection` guest copy).
* Tests: domain `profile` (8: taxonomy, create/edit validation, goals normalization/cap); backend `profile` (5: create/edit + createdAt preservation, per-user isolation, anonymous 401, invalid taxonomy 400, metric); web `backend-client-profile` (3: GET null, PUT body/token, 401 surfacing); db `persistence` +1 (profile round-trip, restart survival, upsert preserves createdAt, account-delete cascade); `render-smoke` updated (App → sign-in landing; onboarding/ProfileForm/ProfileScreen added; guest assertions removed).

Decisions locked:
* `/api/profile` is user-session-only: anonymous (even open local-dev mode) and service callers get 401. Profile identity always comes from the session, never the body.
* `GET /api/profile` returns 200 `{profile:null}` (not 404) before onboarding — the gate's signal.
* Onboarding is enforced client-side (the App gate); the backend does not block interview creation without a profile (roadmap Phase 2 scope).
* Taxonomy keys are canonical snake_case (persisted/wire); labels are presentation-only. Domain is source of truth; the client mirror must be kept in sync.
* Blank goals normalize to absent (never stored as `""`).

Open for Phase 3 (curriculum & skill state): server-owned curriculum + `UserSkillState`; recommendation/evaluation remain backend operations, never realtime tools.

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @interview-coach/web-client build` plus live-DB (migration 0004) and live HTTP profile smoke.
Verified 2026-09-14: install ok, typecheck ok, test 323 passed (304 prior + 19 new; no-DB warn-and-pass and live-DB vs postgres:16 port 5433 both 323; db persistence 6/6 live), `tsc -b` ok, `vite build` ok (327.39kB JS / 98.47kB gzip). Migration 0004 applied to dev + `interview_coach_test`. Live HTTP smoke (port 3230, test DB): register → GET null → PUT → GET saved → anonymous 401 → invalid role 400 → metrics `profilesUpdated=1`.
Tag: `session-phase2` after commit.

## Phase 3 — Curriculum & skill state (2026-09-14)
Status: done (verified below). Roadmap Phase 3, sub-phases 3.1–3.7. Second step of the learning loop: server-owned curriculum + per-user `UserSkillState`/`UserCurriculumProgress`. No LLM/voice work, no recommendation logic, no mastery algorithm (Phase 10/11).

Done:
* Domain (`packages/domain/src/curriculum.ts`, `skill.ts`; `ids.ts`/`problem.ts`/`catalog.ts`/`repositories.ts`/`index.ts`): stable branded `CurriculumId`/`ModuleId`/`TopicId` (slug-based, no UUIDs). `importCurriculum(raw, {knownProblemTitles})` maps the 12-module/59-topic JSON to entities, resolves `problem_titles` → the same `prob_<slug>` IDs the catalog seed uses, assigns global 1-based topic order, and reports unknown/duplicate refs without throwing (partial import safe). `Problem.topicId` set by `importCatalogProblem` from the catalog topic (`topicIdForName`). `skill.ts`: mastery scale `not_started→learning→developing→proficient→mastered`, configurable `MASTERY_THRESHOLDS` (1/2/3/3), `UserSkillState` + `UserCurriculumProgress` entities/factories with validation (counts, outcomes, notes trim/dedupe/cap). Repos: `CurriculumRepository`, `UserSkillStateRepository`, `UserCurriculumProgressRepository` + in-memory impls; `RepositorySet` extended.
* DB (`packages/db`): `curricula`, `curriculum_modules`, `curriculum_topics`, `curriculum_topic_problems` (cascade tree; within-topic order preserved), `user_skill_states` (PK `(user_id, curriculum_id, topic_id)`; `topic_id` deliberately plain text so a curriculum re-seed cannot cascade-delete progress), `user_curriculum_progress` (PK `(user_id, curriculum_id)`), `problems.topic_id` + index. Migration `0005_hot_silvermane.sql` + CHECK constraints (mastery/outcome enums, attempts non-negative & successful≤total, JSONB arrays). Drizzle repos (`save` replaces the curriculum tree atomically; skill/progress upserts) + factory; `truncateAll` extended. `db:seed` now also imports + saves the curriculum (problems first for the join FK), idempotent.
* Backend (`packages/backend/src/curriculum.ts`, `skills.ts`; `app.ts`/`serializers.ts`): `CurriculumService` (list/filter by interview type, get, findTopic across curricula, getDefault) + `SkillService` (user snapshot, get/save skill state + progress). Routes `GET /api/curriculum` (`?interviewType=dsa`), `GET /api/curriculum/topics/:id` (topic + ordered problems, 404 unknown), `GET /api/skills` (user-session-only, 401 anonymous/service — like the profile; returns `{skills, progress:null}` before any state). Serializers for curriculum/skill/progress; no new env.
* Web client: removed the now-unused `src/curriculum.ts` (+ its `nextPractice` test block) and the web Dockerfile `COPY dsa-interview-curriculum.json`; the client no longer bundles the curriculum (server-backed Progress view is Phase 13). `s6-helpers.test.ts` keeps the history coverage.
* Tests: domain `curriculum` (7: 12/59/300 integrity, ordering, title→ID, full catalog coverage, unknown/duplicate reporting, determinism) + `skill` (6: scale/thresholds, create validation, progress dedupe); backend `curriculum` (6: list/filter/400, topic+problems/404, skills 401, empty→persisted, per-user isolation); db `persistence` +2 (real 300-problem curriculum tree round-trip + re-save idempotence + restart; skill state/progress upsert + restart + account cascade). Removed 2 obsolete `nextPractice` tests.

Decisions locked:
* Curriculum is static server config persisted in Postgres and seeded by `db:seed`; the backend serves it from repos (in-memory tests seed it via a helper), never reads the JSON at request time, and never bundles it into the client.
* `curriculum_id` equals the interview type for v1 (`dsa`); the unique skill key is `(user_id, curriculum_id, topic_id)`.
* `user_skill_states.topic_id` / `user_curriculum_progress.current_topic_id` are intentionally not FK'd to `curriculum_topics`: re-seeding replaces topic rows, and a hard FK would wipe user progress. Validity is the domain/service boundary.
* Mastery *algorithm* (evaluation → level) and recommendation are out of scope here (Phase 10/11/4); Phase 3 only defines the scale/thresholds and persists/reads state.

Open for Phase 4 (LLM recommendation service): `RecommendationService` + server-side LLM port + validation + persistence; consumes the profile/curriculum/skill state landed here. Recommendation/evaluation remain backend operations, never realtime tools.

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @interview-coach/web-client build` plus live-DB (migration 0005) seed + live HTTP curriculum/skills smoke.
Verified 2026-09-14: install ok, typecheck ok, test 342 passed (323 prior + 21 new − 2 removed `nextPractice`; no-DB warn-and-pass and live-DB vs postgres:16 port 5433 both 342; db persistence 8/8 live), `tsc -b` ok, `vite build` ok (327.39kB JS / 98.47kB gzip). Migration 0005 applied to dev + `interview_coach_test`; `db:seed` idempotent (1 curriculum / 59 topics / 300 topic-problems after re-run; 300 problems with `topic_id`). Live HTTP smoke (port 3240, dev DB): `GET /api/curriculum` 1/12/59/300 → `GET /api/curriculum/topics/topic_arrays` Arrays + 10 problems (first `prob_move-zeroes`) → unknown topic 404 → anonymous `/api/skills` 401 → register → `/api/skills` `{skills:[], progress:null}`.
Tag: `session-phase3` after commit.

## Phase 4 — LLM recommendation service (2026-09-14)
Status: done (verified below). Roadmap Phase 4, sub-phases 4.1–4.8. Third step of the learning loop: the product loop now starts with a server-owned recommendation. The LLM is advisory only (ADR-002); the backend builds the candidate set, validates every proposal, and always falls back deterministically. No dashboard/lobby UI (Phase 5/6).

Done:
* Domain (`packages/domain/src/recommendation.ts`; `ids.ts`/`repositories.ts`/`index.ts`): branded `RecommendationId` (`rec_<uuid>`). `Recommendation` entity (userId, curriculumId, `recommendationType` ∈ `new_topic|continue_topic|reinforce_weakness|review_topic|advance_topic`, topicId, problemId, reason, `source` ∈ `llm|fallback`, `status` ∈ `active|accepted|superseded`, acceptedAt) + validation; `acceptRecommendation` (active→accepted, idempotent, superseded → CONFLICT) and `supersedeRecommendation` (idempotent). `buildRecommendationCandidates` — pure, deterministic, ordered candidate set (current topic continue/new → weak-topic reinforce → forward advance/new → mastered review → remaining fallback), within-topic problem chosen by `min(successfulAttempts, n-1)`, capped at 12. `validateRecommendationProposal` (type + candidate-set membership + reason) canonicalizes titles/difficulty from the candidate; `fallbackRecommendation` returns the top candidate (always defined for a non-empty set). `RecommendationModel` port (`recommend(input) → {proposal|null, error?}`), `RecommendationProposal`, `RecommendationModelInput`. `RecommendationRepository` contract + in-memory impl; `RepositorySet.recommendations`.
* Backend (`packages/backend/src/recommendation-model.ts`, `recommendation.ts`; `config.ts`/`app.ts`/`serializers.ts`/`metrics.ts`/`prometheus.ts`/`rate-limit.ts`): `AzureFoundryRecommendationModel` (Azure OpenAI-compatible `chat/completions`, `api-key` header, JSON-object response, AbortController timeout, retry on timeout/429/5xx, no retry on 4xx; `buildRecommendationMessages` + `parseRecommendationProposal`/`extractChatContent` pure helpers), `UnconfiguredRecommendationModel`, `createRecommendationModelFromEnv`; `RecommendationService.generate/current/accept` (synchronous generate: load profile/skills/progress/problems → candidate set → model → validate → supersede prior non-superseded → persist; model throw/invalid/unconfigured → deterministic fallback with `source:"fallback"`). Routes `GET /api/recommendations/current` (latest non-superseded or null), `POST /api/recommendations` (201 + source), `POST /api/recommendations/:id/accept` (ownership → foreign id 404); all user-session-only (401 anon/service). `LLM_ENDPOINT/LLM_API_KEY/LLM_DEPLOYMENT/LLM_API_VERSION/LLM_TIMEOUT_MS/LLM_MAX_RETRIES`; `RATE_LIMIT_RECOMMENDATION_PER_MIN=30` bucket on POST generate. Metrics/logs `recommendation.generated` (source + modelError), `recommendation.accepted`; counters `recommendationsGenerated/Accepted/Fallbacks` (+ Prometheus).
* DB (`packages/db`): `recommendations` table (migration `0006_perfect_wallow.sql` + CHECKs for type/source/status/reason; cascade with the account; `topic_id`/`problem_id` deliberately plain text like `user_skill_states` so a curriculum re-seed cannot delete recommendations). `DrizzleRecommendationRepository` (`findCurrentByUser` = latest non-superseded; `listByUser` newest-first) + factory; `truncateAll` extended.
* Web client: `BackendClient.getCurrentRecommendation/createRecommendation/acceptRecommendation` + `SerializedRecommendation`/`RecommendationType`/`RecommendationStatus`/`RecommendationSource` (consumed by Phase 5/6).
* Tests: domain `recommendation` (10: determinism, new/continue/reinforce/advance/review ordering, cap, validation rules, entity/status transitions); backend `recommendation` (6: LLM-valid path, invalid-proposal fallback, model-throw fallback, supersession, ownership/accept, 401 + metrics) + `recommendation-model` (8: prompt/parse, success, 5xx retry, 4xx no-retry, abort, provider selection); web `backend-client-recommendation` (4); db `persistence` +1 (recommendation round-trip, restart, supersession, account cascade).

Decisions locked:
* The candidate set is the only menu the LLM may pick from; the backend canonicalizes topic/problem titles+difficulty and rejects any pair not in the set (`VALIDATION_ERROR`). `recommendationType` from a valid proposal is kept; the candidate supplies the rest.
* `GET /current` = latest recommendation whose status is not `superseded` (active or accepted). `POST /recommendations` supersedes every prior non-superseded proposal before persisting the new active one.
* Generation is synchronous and never errors on model failure: unconfigured/throw/invalid all yield `source:"fallback"`. Only a missing/empty curriculum yields a domain error (404).
* `recommendations.topic_id`/`problem_id` are not FK'd (same rationale as `user_skill_states`): a curriculum re-seed must not wipe user state.
* `LLM_*` are server-only (never `VITE_*`); blank endpoint/key is the supported local-dev configuration (deterministic loop). Entra/Managed-Identity auth stays the deploy follow-up (ADR-002).

Open for Phase 5 (Dashboard): rewrite Dashboard to consume `GET /api/recommendations/current` (+ profile/skills/interviews) as the primary CTA; Start creates an interview from the recommendation. Recommendation/evaluation remain backend operations, never realtime tools.

Verify: `pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @interview-coach/web-client build` plus live-DB (migration 0006) persistence + live HTTP recommendation smoke.
Verified 2026-09-14: install ok, typecheck ok, test 371 passed (342 prior + 29 new; no-DB warn-and-pass and live-DB vs postgres:16 port 5433 both 371; db persistence 9/9 live incl. recommendations), `tsc -b` ok, `vite build` ok (327.74kB JS / 98.52kB gzip). Migration 0006 applied to dev + `interview_coach_test`; CHECKs present (`recommendations_type/source/status/reason_check`). Live HTTP smoke (port 3250, dev DB, LLM unconfigured): register → `GET current` null → `POST` fallback (`new_topic` Arrays → `prob_move-zeroes`, `source:"fallback"`) → `GET current` same id → `accept` (`status:"accepted"`, `acceptedAt`) → anonymous 401 → metrics `{generated:1, accepted:1, fallbacks:1}`.
Tag: `session-phase4` after commit.
