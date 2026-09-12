# Architecture — Frozen (S0)

Source: `interview-coach-hld-and-implementation-plan.md` (2026-09-11). This file is the immutable pointer. Changes require an ADR + HLD amendment, never a silent refactor.

## 1. Principle

> Backend owns truth; model owns conversation.

* Model-owned: wording, what to ask next, when to probe, when a tool is useful, adapting to candidate.
* App-owned: candidate identity, interview ID, canonical problem, status, scores, evaluation, timestamps, persistence, authz, final state. Model output never becomes canonical state.

## 2. Planes (locked)

```text
Media plane:   Browser <--WS/PCM16-24kHz-mono--> Azure Voice Live (audio, VAD, STT/TTS)
Control plane: Browser <--HTTPS/WS--> Fastify backend (auth, interviews, ephemeral mint, state, results)
Tool path:     Voice Live --function_call--> Browser --POST /tool-exec--> Fastify --result--> Browser --function_call_output--> Voice Live
```

* No backend-proxied realtime audio. Browser↔Voice Live direct with backend-minted ephemeral only.
* External CLI harness at `/home/pankaj/dev/Projects/InterviewCoachCli` is the regression path; it is NOT duplicated in this repo.

## 3. Validated realtime config (reuse as-is)

* Endpoint `https://interview-coach-voice.services.ai.azure.com`, model `gpt-realtime-mini`, API `2026-04-10`.
* Voice: `{ type: "azure-standard", name: "en-US-Andrew:DragonHDLatestNeural" }` — the harness sends the voice as this `{ type, name }` object, not a bare name string.
* Audio PCM16 / 24 kHz / mono both directions.
* Turn detection: `server_vad{threshold 0.35, speech_duration_ms 80, silence_duration_ms 500, interrupt_response true, create_response true}` — enabled and validated.
* Input echo cancellation / noise suppression: Voice Live *capabilities* that exist as session options (`server_echo_cancellation`, `azure_deep_noise_suppression`), but the CLI harness does **not** enable them — the validated MVP ran with **raw mic** (no server AEC, no server noise suppression; both fields commented out in the harness `voice-session.ts`). The S4 web client instead adds echo cancellation + noise suppression in its own WebAudio path.
* Barge-in: `speech_started → response.cancel → local playback flush (~4–5 ms)`. Variance is server VAD detection, not local flush.
* Logging: lifecycle/timing only. Never per-PCM-chunk.
* Baseline metrics from the validated MVP run: `docs/mvp-baseline-metrics.md`.

## 4. Tool boundary

Narrow domain tools only: `get_current_problem`, `get_interview_state`, `get_candidate_performance`, `end_interview` initially; later `get_problem_hint`, `record_candidate_answer`, `evaluate_solution`, `run_code`, `submit_solution`, `get_interview_configuration`. Never generic DB/SQL.

Tool requirements: narrow scope, authz vs current interview, deterministic where possible, observable, idempotent where practical, `call_id` dedup.

## 5. Tool-call reliability (locked defaults)

* Browser forwarder: preserve original Voice Live `call_id`, 8s request timeout, max 2 retries (3 attempts) with same `call_id`, backoff ~300ms→800ms+jitter. Retry only timeout/network/502/503/504/`retryable:true`. Never retry 4xx/`retryable:false`/validation/authz. Exactly-once `function_call_output` per `call_id` (local submitted-set).
* Fastify: generic `withIdempotency(call_id, fn)` — unseen→execute once; executing→singleflight share; completed/failed-permanent→replay stored result. In-memory Map cap ~2000, TTL 30 min, sweep 60s. Endpoints: `POST /api/interviews/:id/tool-exec`, `GET /api/interviews/:id/tool-results/:call_id` (recovery).
* Reconnect: queue unacked outputs (bounded 20), flush on reconnect skipping acked; on reload rehydrate pending `call_id`s from sessionStorage via `GET tool-results`.
* Observability (8 points): `tool.requested → tool.received → backend_request_started → execution_started → execution_completed → result_received → output_submitted → next_response_started`. Track E2E/backend/forward latencies; alert E2E p95 > 6s, backend p95 > 1s.
* No Redis/queues in MVP. Promotion to Postgres `tool_call_records(call_id PK, ...)` only when multi-instance or restart-safe side effects required (S8).

## 6. Lifecycle (app-only transitions)

`created → ready → in_progress ⇄ paused → completing → completed` + `cancelled`, `failed`. Model may signal done; only app transitions.

## 7. Stack (locked S0)

* `pnpm` workspaces + `tsx` + TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) + `vitest`.
* Backend: Fastify (`@fastify/websocket`, cors, rate-limit, zod validation, pino).
* DB: Postgres 16 via docker-compose; Drizzle ORM (S2). In-memory repo impls for Phase-1 unit tests.
* Client (S4+): Vite + React + TS. No `VITE_AZURE_*`, no Azure SDK in client.
* Secrets server-side only. API-key mode local-dev-only.

## 8. Explicitly out of realtime path

`interview-agent` (background eval/reports/analytics only), generic agent framework, custom STT/TTS, memory system, multi-agent orchestration, code sandbox before Phase 6/7.

## 9. Phase order

0 Freeze (S0) → 1 Domain (S1) → 2 Persistence (S2) → 3 Voice session + idempotency (S3) → 4 Web client (S4, rebuilt S6 per SD3 handoff) → 5 Intelligence/eval (S5a backend + S5b web) → 6 Sandbox (S7) → 7–8 Hardening/deploy (S8).
