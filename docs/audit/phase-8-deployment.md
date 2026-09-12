# Audit — Phase 8: Production Deployment

- **HLD phase:** Phase 8 (Production deployment: 8.1–8.4)
- **Implemented in:** S8b (`@interview-coach/backend` + `@interview-coach/web-client` +
  root compose/CI), tag `session-8b`. Retention/delete (HLD 7.4) was delivered in
  S8b and is re-checked here because it is part of "operated reliably".
- **Source of truth:** HLD §10 Phase 8; frozen §4/§5/§7;
  `docs/data-retention.md`; `docs/architecture-frozen.md` §9 (phase→session map);
  `.github/workflows/ci.yml`; `docker-compose.yml`.
- **Scope of this audit:** the container images + compose stack (`packages/backend/Dockerfile`,
  `packages/web-client/Dockerfile`, `nginx.conf`, `docker-compose.yml`), the CI
  pipeline (`.github/workflows/ci.yml`), the monitoring surface
  (`metrics.ts`, `prometheus.ts`, `/api/ready|metrics`), and the release
  readiness of the whole (what "can be released and operated reliably" actually
  means against the shipped artifact). The Phase-7 handoff pushed four
  release-blocking items into this phase (F6-1, F7-4, V3-5, F6-3/C4-2); they are
  re-checked here as the release gate.

## Exit criteria (HLD, quoted)

> **Exit criteria:** Product can be released and operated reliably. (§10 Phase 8)

## Checklist vs HLD

### 8.1 Containerization
- [x] Backend image — `packages/backend/Dockerfile`: node:24-slim, `--prod` install,
      non-root `app` user, `/api/ready` healthcheck, boot-migrates then serves
      (`Dockerfile:12-42`).
- [x] Web image — `packages/web-client/Dockerfile`: build stage + nginx:alpine,
      SPA fallback, immutable `/assets` cache, API not proxied (`nginx.conf:13-21`).
- [x] Orchestration — `docker-compose.yml`: `db` (postgres:16, health-gated) +
      `backend` (`HOST 0.0.0.0`, `DATABASE_URL` at `db:5432`, boot migrates) +
      `web` (`:8080`), `pgdata` volume.
- [~] Runtime is tsx-on-source (no compiled emit); `tsx` is a runtime dependency
      in both `backend` and `db`. Documented trade-off, not a correctness bug (F8-9).

### 8.2 CI/CD
- [x] CI gate — `.github/workflows/ci.yml`: typecheck → migrate → live-Postgres
      tests → `tsc -b` → web build → bundle secret scans → both docker builds →
      compose boot probe → always-teardown.
- [x] Security checks — client bundle scans for `VITE_AZURE_*=`/voice key/`sk-`
      values; backend must never reference `VITE_`.
- [ ] **Deploy step absent.** The HLD chain is `test -> build -> security checks ->
      deploy`; CI ends at "build images + boot probe". No registry push, no
      staging/prod target, no CD (F8-5).

### 8.3 Environments
- [~] Development (local `tsx`/`vite`) and a production image (`NODE_ENV=production`)
      exist, but there is no staging environment and no per-environment config
      surface beyond env vars. "Define development/staging/production" is unmet (F8-6).

### 8.4 Monitoring
- [x] Availability — `GET /api/health` (open) + `GET /api/ready` (DB ping → 503).
- [x] Tool failures/replays — `tool_executions_total`, `tool_replays_total`,
      `tool_failures_total` (Prometheus `interview_coach_*` series).
- [~] Voice/real-time — only mint/reject counters (`voice_sessions_minted_total`,
      `voice_sessions_rejected_total`). **Realtime failures, Voice Live errors, and
      latency are untracked** — the browser↔Voice Live loop is invisible to the
      backend by design (frozen §2), but nothing emits those signals (F8-7).
- [~] Interview completion rate — `interviews_created_total` /
      `interviews_deleted_total` exist, but there is no per-status transition
      counter, so completion/failure rate is not derivable (F8-7).
- [~] Evaluation failures — no evaluation metric at all (F8-7).

### Cross-check (HLD 7.4 delivered in S8b)
- [x] Retention/deletion — `DELETE /api/interviews/:id` hard-erases with cascade
      (`app.ts:675-689`, `schema.ts` `onDelete: "cascade"`); live interviews
      refused; audit log; `docs/data-retention.md`. Verified live below.

## Verification (run this session)

```
pnpm typecheck                                   # ok (tsc --noEmit)
pnpm build                                       # ok (tsc -b)
pnpm test                                        # 258 passed (36 files) — warn-and-pass w/o Postgres
DATABASE_URL=postgresql://coach:coach_dev_only@localhost:5433/interview_coach pnpm test  # 258 passed, persistence live
pnpm --filter @interview-coach/web-client build  # ok (314.45kB JS / 96.60kB gzip)
docker build -f packages/backend/Dockerfile -t interview-coach-backend:audit .   # ok
docker build -f packages/web-client/Dockerfile -t interview-coach-web:audit .    # ok
POSTGRES_PORT=5433 BACKEND_PORT=3121 WEB_PORT=8091 docker compose up -d db backend web
```

Result: all green. Compose boot probe (ports remapped — host 5432/3000 are
occupied by system Postgres and prior smokes): db healthy → backend boot-migrated
→ `/api/ready` 200, `/api/health` 200, `/api/metrics/prometheus` 200 (see F8-2),
web 200 + SPA fallback 200; seed 300 problems / 0 skipped (idempotent); live smoke
create→ready→voice-session→`VOICE_NOT_CONFIGURED` 503 (F8-3)→delete→404 all
correct; retention erase returns `{deleted:{status:"created"}}` and a second GET
404s. Stack torn down (`docker compose down -v`) after.

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| F8-1 | Critical | `code-runner.ts:217-225` (`execFile` with no `env` override); `Dockerfile` runs it in the prod image | 8.1, 7.3 | **The production container ships remote code execution with full secret access.** The `LocalCodeRunner` spawns candidate code via `execFile` with no `env` scrub, so the child inherits `DATABASE_URL`, `API_AUTH_TOKEN`, and `AZURE_VOICE_API_KEY`; `solve = () => process.env.AZURE_VOICE_API_KEY` exfiltrates the key into a persisted visible case. Phase 8 is the containerization phase, and the container did not fix the runner — it packaged the vulnerability. This is F6-1 handed forward as **blocking**, and it is still open. | Scrub `env` to an allowlist, drop privileges, `rlimit` CPU/mem, and run the runner in a no-network container (`--network=none`, cgroup quotas) before any internet exposure. This is a hard release gate, not polish. |
| F8-2 | Major | `auth.ts:65-67,88-91`; `Dockerfile:34-36`; `docker-compose.yml:34` (`API_AUTH_TOKEN: ${API_AUTH_TOKEN:-}`) | 8.3, 7.2 | **A stock `docker compose up` ships a fully open, un-owned product.** The image sets `NODE_ENV=production`, but the compose default leaves `API_AUTH_TOKEN` empty and the backend only logs a warning — verified live: `/api/metrics/prometheus` returned 200 with no token and the log shows `API_AUTH_TOKEN is not set: /api is open (local-dev mode)`. Every interview is readable/deletable by anyone. Same "convention-not-enforced" shape as V3-5 (F7-4). | Fail closed in production: refuse to start when `NODE_ENV === "production"` and no auth mechanism is configured, or require an explicit `ALLOW_ANONYMOUS=true` opt-in. The image already sets `NODE_ENV=production`, so a guard placed in `loadConfig`/`buildApp` would fire correctly in this exact container. |
| F8-3 | Major | `voice-session.ts:104-115`; `docker-compose.yml:35-39` | 8.1, 3.1 | **The shipped deploy cannot run a voice interview at all.** The only configured provider path is `ApiKeyLocalDev` (empty key default) and the `Unconfigured` stub (503); Entra ephemeral mint is unimplemented (S8d parked). Verified: `POST .../voice-session` → 503 `VOICE_NOT_CONFIGURED`. The product's core feature is unavailable in the release artifact. | Unblock Entra ephemeral mint (S8d prerequisites) before a real release, or document the voice-less compose as a demo-only artifact. Until then the "release" is not the product. |
| F8-4 | Minor | `voice-session.ts:48-53`; `app.ts:417` | 8.4 | **`/api/ready` reports `voiceMode: "entra-ephemeral"` for the unconfigured stub.** The `UnconfiguredVoiceSessionProvider` advertises `mode = "entra-ephemeral"`, so an operator reads "Entra mint is configured and working" when it actually 503s on every mint. Misleading availability signal. | Give the unconfigured provider a distinct mode (e.g. `"unconfigured"`) so `/api/ready` and metrics tell the truth. |
| F8-5 | Major | `.github/workflows/ci.yml:81-105` | 8.2 | **No deploy step — the "CD" half is absent.** The HLD chain is `test -> build -> security checks -> deploy`; CI stops at image build + boot probe. There is no registry push, no staging/production deployment, no promotion. "Release" is entirely manual. | Add a deploy job (registry push + a deploy target) once an environment exists; at minimum record the intended release process. |
| F8-6 | Minor | `docker-compose.yml`, no staging config anywhere | 8.3 | **Environments are not defined.** Development and the production image exist, but staging is missing and there is no per-environment configuration surface (no config file/dir, only env vars). `NODE_ENV=production` is set only inside the Dockerfile, so a plain `tsx src/server.ts` run never sees it — which matters for the F8-2/F7-4 guard, whose trigger signal is inconsistent across run modes. | Define three environments explicitly and set `NODE_ENV` at the process/launch level (compose `environment:`), not only in the image, so prod guards are reliable. |
| F8-7 | Major | `metrics.ts`, `prometheus.ts`, `app.ts:422-435` | 8.4 | **Monitoring covers only a subset of the HLD list.** Present: availability, tool executions/replays/failures, voice mint/reject, code runs/submissions, auth, sessions, idempotency size. Missing entirely: realtime failures, Voice Live errors, latency, interview completion rate (no per-status transition counter), evaluation failures. A deploy can be "up" while silently failing every interview and the dashboards would not show it. | Add per-lifecycle-transition counters (completion/failure rate) and an evaluation counter; route the client/voice loop to emit a lightweight heartbeat/error signal (or accept and document that realtime failures are invisible by frozen §2, and instrument the browser instead). |
| F8-8 | Minor | `idempotency.ts`, `rate-limit.ts`, `metrics.ts`, `activeVoiceSessions` (all in-memory) | 8.4 | **Single-instance by design, undeclared at the deploy layer.** Idempotency store, active voice sessions, rate limiter, and metrics are all process-local; compose runs exactly one backend replica. A rolling restart (or any >1 replica) drops active sessions and call_id records. Documented at the module level but not surfaced as an operational constraint of the compose stack. | Document "one replica only" as a deployment constraint (or a data-retention/compose note); multi-instance needs shared state, which is out of scope but should be named. |
| F8-9 | Minor | `packages/backend/Dockerfile:2-6`; `backend/package.json:19` (`tsx` runtime dep) | 8.1 | **Production runtime is tsx-on-source.** No compiled emit; `tsx` ships as a runtime dependency in both `backend` and `db`. Acknowledged in the Dockerfile comment, but it means a larger runtime surface and a per-boot transpile cost for a "release" image. | Emit compiled JS (needs composite tsconfigs across domain/db/backend) as a follow-up; accept as documented trade-off meanwhile. |
| F8-10 | Nit | `.github/workflows/ci.yml:93-101` | 8.2 | **The web image is built but never boot-probed in CI.** The boot probe only does `docker compose up -d db backend` and checks `/api/ready`; the SPA fallback/asset caching is not exercised in CI (it was verified manually here). | Extend the probe to boot `web` and assert `/` + a deep-link fallback 200. |

## Release-blocking items carried into Phase 8 (re-checked, still open)

These arrived from Phase 7 (and earlier) as the release gate. Re-verified against current
code and the production image — all still open at Phase 8 close.

| ID | Status | Evidence (refreshed) | Why it is still a release blocker |
|---|---|---|---|
| F6-1 (Critical) | open → **F8-1** | `code-runner.ts:217-225`; packaged verbatim into `interview-coach-backend` | The containerization phase shipped the RCE-with-secret-access runner into the production image instead of isolating it. Remote code execution with `DATABASE_URL`/`API_AUTH_TOKEN`/`AZURE_VOICE_API_KEY` reachable. |
| F7-4 (Major) | open → **F8-2** | `auth.ts:65-67`; compose `API_AUTH_TOKEN:-` default; `NODE_ENV=production` in image | Stock compose boot is open + un-owned, with only a startup warn. Verified live in this audit (prometheus 200 without token). |
| V3-5 (Minor) | open | `voice-session.ts:58-80,104-114` | api-key voice mode still returns the long-lived key verbatim with no prod guard; compose's only non-503 voice path. Compounds F8-1 (key also readable by candidate code). |
| F6-3 (Major) | open | `tool-service.ts` submit/run call `SubmissionService` directly; `rate-limit.ts:95-99` | Sandbox quotas still HTTP-route-only; the model (primary sandbox caller) bypasses concurrency/submission budgets and the tighter `codeRun` bucket. |
| C4-2 (Major) | open | `tool-forwarder.ts` `isRetryableFailure`; `backend-client.ts` `ToolExecFailure.retryable` hardcoded false | The forwarder never honors the `429 retryable:true` + `Retry-After` contract, so the S8a limiter's backoff is dead code and quota 429s surface to the model as permanent failures — relevant to "operate reliably under load". |

## Cross-phase observations (carried forward)

- **F8-1 / F8-2 / V3-5** remain one root cause — *local-dev-only by convention,
  not enforced in code* — and now additionally *packaged by the release image*.
  They should land as a single "production-mode guard" sweep before any release:
  scrub the runner `env` + isolate it, refuse open auth, refuse api-key voice.
- **F8-3** is the product-level blocker the security items hide behind: even a
  perfectly hardened stack cannot deliver a voice interview because Entra mint is
  unimplemented. Phase 9 (product expansion) is gated on DSA voice being "stable
  in prod" — which cannot happen until F8-3 is resolved.
- **I5-1** (evaluation downgrade) and **F6-2** (scoring-over-runs) remain open and
  are prerequisites for the evaluation metrics that F8-7 wants.

## Handoff (end of audit chain)

Phase 8 is the last audited phase. The audit chain ends here; the following are
out of scope but flagged as known-open:

- **Phase 9 — Product expansion** (UNSTARTED): gated on DSA voice interviews being
  stable in prod, which is itself gated on F8-3 (working voice) and F8-1/F8-2
  (safe + owned).
- **S8d — Prod identity + prod voice + account erasure** (PARKED): the seam is
  ready (ADR-001 §4); prerequisites are provider app registrations + the voice
  resource confirmation listed in `SESSION_HANDOFF.md` S8d. F8-3 unblocks here.

**Recommended release gate order:** (1) F8-1 runner isolation + env scrub, (2) F8-2
prod auth fail-safe + V3-5 voice guard (one sweep), (3) F8-3 Entra voice mint, (4)
F8-5 deploy pipeline + F8-6 environment definitions + F8-7 monitoring gaps, (5)
F6-3/C4-2 quota-contract fixes, (6) the Minor/Nit polish (F8-4, F8-8, F8-9, F8-10).
