# Deployment & Release

Operational notes for the Interview Coach backend + web client (HLD Phase 8,
S8b). The audit (`docs/audit/phase-8-deployment.md`) drives the items below.

## Environments (audit F8-6)

| Env | How it runs | `NODE_ENV` | Auth |
|---|---|---|---|
| Development | `pnpm --filter @interview-coach/backend dev`, `web-client dev` | unset/`development` | open local-dev (no token) |
| Staging | not defined yet | `staging` | token + (eventually) Entra |
| Production | `docker compose up -d db backend web` | `production` (set at the process level in compose) | required |

`NODE_ENV` is set in the compose `backend.environment`, not only in the image,
so the production fail-safes below fire consistently regardless of how the
process is launched.

## Release process (audit F8-5)

CI (`.github/workflows/ci.yml`) runs: install → migrate → typecheck → live-DB
tests → `tsc -b` → web build → bundle secret scans → both container builds →
compose boot probe (db + backend + web, readiness, Prometheus, SPA fallback).
CI ends at the boot probe: **there is no automated registry push or deploy
target yet.** The intended manual process is:

1. Tag the release commit (`session-*` convention).
2. `docker build -f packages/backend/Dockerfile -t <registry>/interview-coach-backend:<tag> .`
3. `docker build -f packages/web-client/Dockerfile -t <registry>/interview-coach-web:<tag> .`
4. Push both, then roll the deployment with the environment variables from
   `.env.example` (secrets via the platform's secret store, never committed).

Adding a real deploy job needs a registry + target and is intentionally
deferred until those exist.

## Single-instance constraint (audit F8-8)

The idempotency store, active voice-session map, rate limiter, and metrics are
all process-local. **Run exactly one backend replica.** A rolling restart (or
any >1 replica) drops active voice sessions and `call_id` records. Multi-
instance needs shared state (e.g. Postgres `tool_call_records`) and is out of
scope for the MVP (frozen §5).

## Runtime (audit F8-9)

The production image runs TypeScript via `tsx` on source (no compiled emit).
This is an accepted trade-off: a larger runtime surface and a small per-boot
transpile cost, in exchange for skipping composite tsconfigs across
domain/db/backend. Emitting compiled JS is a follow-up.

## Code sandbox (audit F8-1 / F6-1)

The `LocalCodeRunner` executes candidate code as a subprocess of the backend.
It is hardened (scrubbed env allowlist, dropped privileges when root, Node heap
cap, wall-clock timeout, output caps) but it is **not** a security boundary —
there is no namespace/cgroup/network isolation.

To prevent remote code execution in a shipped deploy, the runner **refuses to
execute when `NODE_ENV=production`** unless `ALLOW_INSECURE_CODE_RUNNER=true`
is set explicitly (code runs then return `error`). Do **not** set that flag on
an internet-facing host. The follow-up is a dedicated sandbox service
(container per run with `--network=none`, CPU/memory quotas, read-only rootfs).

## Voice (audit F8-3)

Entra ephemeral minting is unimplemented (parked S8d). `GET /api/ready`
reports `voiceMode: "unconfigured"` so operators are not misled, and every
`POST .../voice-session` returns 503. The compose stack is therefore a
**voice-less demo** until S8d lands. Local dev can use api-key voice mode
(`AZURE_VOICE_API_KEY`); that mode is refused in production unless
`ALLOW_INSECURE_VOICE_API_KEY=true` (audit V3-5).

## Monitoring (audit F8-7)

Server-side counters (`GET /api/metrics`, `/api/metrics/prometheus`) cover
availability, tool executions/replays/failures, voice mint/reject, code runs/
submissions, auth, active sessions, idempotency size, **per-status interview
lifecycle transitions** (completion/failure rate), and **evaluations recorded**.

Realtime failures, Voice Live errors, and latency are not backend-visible by
design (the browser↔Voice Live media plane is direct; frozen §2). Those signals
are emitted client-side (`voice-client` `onMetric`) and would need browser
instrumentation/export, which is out of scope here.
