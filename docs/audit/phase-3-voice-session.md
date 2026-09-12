# Audit — Phase 3: Production Voice Session Service

- **HLD phase:** Phase 3 (Production voice session service)
- **Implemented in:** S3 (`@interview-coach/backend`), tag `session-3`
- **Source of truth:** HLD §10 Phase 3, §5.6/§5.7, §3.4; frozen §2/§3/§5
- **Scope of this audit:** `packages/backend` S3 core — Fastify HTTP exposure,
  voice-session mint + credential boundary, tool-exec routing + `call_id`
  idempotency, and the restart/observability story. Later additions (S5
  intelligence routes, S7a sandbox, S8a auth/rate-limit/metrics, S8b
  retention/Prometheus, S8c accounts) belong to Phases 5/6/7/8 and are noted
  here only where they interact with S3 code.

## Exit criteria (HLD, quoted)

> **Exit criteria:** Voice Live becomes a reusable product service rather than
> a CLI-only integration. (§10 Phase 3)

## Checklist vs HLD

### 3.1 Session management
- [x] Session creation — `POST /api/interviews/:id/voice-session` mints an
      ephemeral credential + session params (`app.ts:1145-1244`).
- [x] Authorization — route sits behind the S8a auth gate and S8c ownership
      hook (service/user/anonymous callers resolved in `auth.ts`).
- [x] Auto-start — minting from `ready` transitions to `in_progress` before
      the mint (app-owned, not model-owned).
- [ ] Disconnect handling / client disappearance — no backend-side signal
      (media plane is direct browser↔Voice Live); see V3-1.
- [x] Explicit cleanup — `DELETE /voice-session` (idempotent) and interview
      delete clear the `activeVoiceSessions` map.
- [ ] Expiry cleanup — `expiresAt` is stored but never swept; see V3-1.

### 3.2 Credential boundary
- [x] Privileged Azure credentials stay server-side; only the ephemeral
      credential + public session params leave (`voice-session.ts:9-14`).
- [x] Provider seam — `Unconfigured` (503) / `ApiKeyLocalDev` / `Fake`; Entra
      ephemeral mint left behind the seam for S8d.
- [x] No mint URLs guessed; `buildVoiceWebSocketUrl` mirrors the CLI harness.
- [~] api-key local-dev mode returns the server key verbatim to the caller
      (documented local-dev-only, no prod guard); see V3-5.

### 3.3 Tool routing
- [x] `POST /api/interviews/:id/tool-exec {call_id, tool, arguments?}` routes
      to `ToolService.dispatch` (narrow domain tools, no DB access).
- [x] `call_id` idempotency — unseen→once, executing→singleflight,
      completed/failed-permanent→replay; cross-interview reuse → 409
      (`idempotency.ts:96-133`).
- [x] Recovery — `GET .../tool-results/:call_id` rehydrates a stored result
      (404 unknown, 409 cross-interview).
- [ ] Binding is `call_id` only — the `tool` name is not part of the key;
      see V3-3. Singleflight path skips the cross-interview check; see V3-2.

### 3.4 Failure handling
- [x] Tool errors stored as permanent failures, replayed `retryable:false`
      (`errorBody`, `app.ts:1286-1296`); transient throws are NOT stored so a
      retry re-executes (`idempotency.ts:48-61` test).
- [x] Fastify 4xx (empty/malformed JSON) → 400 envelope, never 500
      (`app.ts:372-389`).
- [x] `tool.invoked`/`tool.failed` events recorded once per execution (replays
      skip dispatch; `tool-exec.test.ts:46-59`).
- [ ] Websocket disconnect / model error / client disappearance have no
      backend handling — follows from V3-1 (no media-plane visibility).

### 3.5 Observability
- [x] Lifecycle/timing logs only via pino (`interview.created/lifecycle`,
      `tool.received/executed` with `elapsedMs`+`replayed`,
      `voice_session.created/closed`). No bodies/audio.
- [~] Metrics counters landed in S8a (Phase 7); the 8-point E2E/forward
      latency chain (frozen §5) is a client-side (S4) concern, not S3.

### Cross-cutting Phase-3 principles (HLD §3/§14, frozen §2)
- [x] Backend owns truth — tool path only reads backend state or requests
      app-only transitions; model output never becomes canonical state.
- [x] Realtime audio never proxied — browser↔Voice Live direct.
- [x] `call_id` dedup at the tool boundary (frozen §9).
- [x] Tool contracts stay CLI-compatible (same `call_id`/result shapes).

## Verification (run this session)

```
pnpm typecheck      # ok (tsc --noEmit)
pnpm test           # 258 passed (36 files) — persistence warn-and-pass w/o Postgres
pnpm build          # ok (tsc -b)
```

Result: all green. S3 backend suites are DB-free by design (in-memory repos +
fake voice provider): `idempotency` (6), `tool-exec` (10), `voice-session`
(7), `interviews`, plus later-phase suites. Live-DB smoke was not re-run this
session — the docker daemon is idle and S3 code paths do not touch the DB
(`buildApp` runs on in-memory `RepositorySet`; persistence was validated live
in Phase 2).

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| V3-1 | Major | `app.ts:292, 1171, 1195-1200, 1255, 682`; `voice-session.ts:76-77, 98-99` | 3.1, 3.4 | `activeVoiceSessions` never expires. `expiresAt` is stored on mint but nothing sweeps it; entries are only removed by `DELETE /voice-session` or interview delete. Because the media plane is direct browser↔Voice Live, the backend has no disconnect signal, so a crashed/abandoned client leaks a permanent entry. Once `size` reaches `VOICE_MAX_ACTIVE_SESSIONS` (200), every new mint 429s until restart (`app.ts:1171`), and `GET /api/ready`/metrics report stale sessions. HLD 3.1 "disconnect handling"/"cleanup" and 3.4 "client disappearance" are unmet. | TTL-sweep `expiresAt` (mirror the idempotency store), or a client heartbeat + lazy expiry check in the quota path. |
| V3-2 | Minor | `idempotency.ts:109-111` vs `103-107` | frozen §5 | Singleflight path returns the in-flight promise without checking `interviewId`, so a cross-interview `call_id` collision during concurrent execution returns the *other* interview's result (`replayed:true`) instead of a 409 CONFLICT. The completed-records path does check (`existing.interviewId !== interviewId`). Astronomically unlikely (UUID call_ids) but the frozen cross-interview guarantee is only half-enforced. | Check `interviewId` on the pending entry too (or store the pending `interviewId`). |
| V3-3 | Minor | `idempotency.ts:96-133`; `app.ts:1067, 1073` | frozen §5 | The idempotency key is `call_id` alone; the `tool` name is recorded but not part of the binding. A retry that reuses a `call_id` with a different tool name replays the first tool's result as if it were the second's. No current bug (the S4 forwarder re-sends the same tool per `call_id`), but the contract isn't self-enforcing. | Bind `(call_id → {interviewId, tool})` and 409/400 on mismatch. |
| V3-4 | Minor | `app.ts:1156-1160` vs `1171, 1186` | 3.1, 3.4 | The `ready` branch auto-starts (`interviews.start`) *before* the quota check and mint, so a 429 (map full) or 503 (no credential) still leaves the interview `in_progress` with no session. Retries work (the `in_progress` branch re-mints), but each rejected attempt records a false start and compounds V3-1's stale-map exhaustion. | Check quota/credential availability before the auto-start, or start only after a successful mint. |
| V3-5 | Minor | `voice-session.ts:70, 111-114` | 3.2, frozen §7 | `ApiKeyLocalDevVoiceSessionProvider` returns the long-lived server `AZURE_VOICE_API_KEY` verbatim as the "ephemeral" credential. Local-dev-only by convention, but there is no code path that refuses api-key mode in a production deploy — a stray `AZURE_VOICE_API_KEY` env var would leak the key to every client on each mint. (Secret non-leak in logs/bundles is already tested in S8a; the *credential* itself is what leaks here.) | Gate api-key mode behind an explicit `NODE_ENV !== production` / `VOICE_PROVIDER` flag, or refuse to start with the key in prod until S8d Entra mint lands. |
| V3-6 | Minor | `app.ts:160-162, 691-710`; `interview-service.ts:165-193`; `repositories.ts:239-252` | 1.3, 2.2 | **Carried-forward P2-2 (verified still open).** `assignProblemsSchema` does not reject/dedup duplicates, and `assignProblems` accepts them; `findManyByIds` returns one entry per input id, so `problems.length === problemIds.length` passes, then the Drizzle `(interview_id, problem_id)` unique index rejects the save with an uncaught constraint error → 500. In-memory repos have no index, so unit tests pass silently with duplicated assignments (prod/unit divergence). | Reject duplicates in `assignProblems` (or a zod `.refine`) before save. |

## Cross-phase observations (carried forward, not Phase-3 defects)

- The 8-point tool-latency chain and p95 alerting (frozen §5) are not
  implemented in the backend; the E2E/forward halves belong to the S4 browser
  forwarder, which is out of scope here. Verify coverage in Phase 4.
- `get_candidate_performance` returns counts + `lastRunStatus` but never the
  candidate's code text (product wants the coach to "have access to code all
  the time"). Surfaced via S7a `submit_solution`; audited in Phase 6.

## Handoff to Phase 4 (Web client)

- Verify the S4 browser forwarder honors the frozen §5 retry/idempotency
  contract against these routes: same `call_id` every attempt, never retry
  `retryable:false`/4xx, exactly-once `function_call_output`. The backend's
  `replayed` flag and `tool-results` recovery are the contract surface.
- V3-1 (session-map expiry) matters most for the client: the browser is the
  only party that *can* signal disconnect (`DELETE /voice-session`). Confirm
  hangup/abandon paths always call it, and consider a client heartbeat while
  the backend gains expiry.
- V3-3/V3-2 are defensive; keep the S4 forwarder re-sending the identical
  `(call_id, tool)` so the gaps stay unobservable in practice.
- F1 (difficulty enum), F2 (multi-problem progression), P2-1 (CAS), P2-3/P2-4/
  P2-5, and V3-5/V3-6 remain open — F1/F2 resurface in the UI/selection path.
