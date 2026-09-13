# Interview Coach — Build-Phase Audit

> Post-build audit of the HLD phased implementation plan. The HLD
> (`interview-coach-hld-and-implementation-plan.md`) is the source of truth;
> `docs/architecture-frozen.md`, `docs/interview-coach-product-decisions.md`,
> and `docs/interview-coach-ui-specification.md` are secondary references.

Each HLD phase is audited in its own session. A phase file contains the audit
checklist plus the findings recorded by that session, and ends with a handoff
to the next phase. Run phases in order; a finding that cannot be resolved in
its own phase is carried forward through the handoff chain.

## Run order / handoff chain

```
phase-0-freeze       (S0)       -> phase-1
phase-1-domain       (S1)       -> phase-2
phase-2-persistence  (S2)       -> phase-3
phase-3-voice-session(S3)       -> phase-4
phase-4-web-client   (S4/S6/S6.1) -> phase-5
phase-5-intelligence (S5a/S5b)  -> phase-6
phase-6-sandbox      (S7a/S7b)  -> phase-7
phase-7-security     (S8a/S8c)  -> phase-8
phase-8-deployment   (S8b)      -> (end)
```

Phase 9 (product expansion) is unstarted and S8d (prod identity) is parked —
they are out of audit scope but are flagged as known-open in the relevant
handoffs.

`ux-conformance.md` is a **separate, spec-first review** of the web client
against `docs/interview-coach-ui-specification.md`. Unlike phases 0–8, the UI
specification is **normative** there (it takes precedence over the HLD and the
frozen docs). It runs independently of the phase chain.

## Traceability matrix

| Audit | HLD phase | Implemented in | Tag(s) |
|---|---|---|---|
| 0 | Phase 0 — Freeze MVP | S0 | `session-0` |
| 1 | Phase 1 — Domain + backend foundation | S1 | `session-1` |
| 2 | Phase 2 — Persistence | S2 | `session-2` |
| 3 | Phase 3 — Production voice session service | S3 | `session-3` |
| 4 | Phase 4 — Web client | S4 + S6 + S6.1 | `session-4/6/6-1` |
| 5 | Phase 5 — Interview intelligence | S5a + S5b | `session-5a/5b` |
| 6 | Phase 6 — Code execution & sandbox | S7a + S7b | `session-7a/7b` |
| 7 | Phase 7 — Security hardening | S8a + S8c | `session-8a/8c` |
| 8 | Phase 8 — Production deployment | S8b | `session-8b` |
| UX | UI specification conformance (spec-first) | S4 + S6 + S6.1 | `session-4/6/6-1` |

## Severity rubric

- **Critical** — violates a frozen architecture plane or an HLD principle
  (backend owns truth, tools narrow, credentials server-side, no secret leak,
  real sandbox isolation).
- **Major** — an HLD exit criterion is unmet, or a product requirement is
  missing/incorrect (e.g. a required language, an unreachable state).
- **Minor** — a robustness/consistency gap or a deviation that is already
  ADR'd/deferred, not a blocker.
- **Nit** — style, docs, or defensive-code nit with no current impact.

## Verification command set

```sh
pnpm install
pnpm typecheck                 # tsc --noEmit
pnpm test                      # vitest run (DB tests warn-and-pass w/o Postgres)
pnpm build                     # tsc -b
pnpm --filter @interview-coach/web-client build   # phases 4+
# live-DB (phases 2, 3, 5, 6, 7, 8):
POSTGRES_PORT=5433 docker compose up -d db
DATABASE_URL=postgresql://coach:coach_dev_only@localhost:5433/interview_coach \
  pnpm --filter @interview-coach/db db:migrate
DATABASE_URL=... pnpm test
# compose boot probe (phase 8):
docker compose up -d db backend web
```

## Findings format

Each phase file records findings as:

```
ID | Severity | Evidence (file:line) | HLD ref | Shortcoming | Fix direction
```

A phase ends with "Handoff to Phase N+1" listing open/carried-forward items.

## Remediation status (2026-09-13)

Phases 1–8 findings were remediated in order, backend-first, against the
frozen web client and the product decisions. One commit per phase:

| Phase | Commit | Notes |
|---|---|---|
| P1 + P2 | `8ed71dc` | domain + persistence |
| P3 | `aea3af2` | voice session + idempotency |
| P4 | `be1a25a` | web-client contract fixes |
| P5 | `dc6e81b` | interview intelligence |
| P6 | `51ec9e2` | code sandbox |
| P7 | `45c985e` | security hardening |
| P8 | `ba24121` | deployment + monitoring |

See `docs/SESSION_HANDOFF.md` ("Audit remediation P1–P8") for the full mapping.
Items intentionally deferred (product decision or external dependency):
F6-2 (scoring model open, product-decisions §17), F8-1 (full container
isolation; runner is prod-gated off by default), F8-3 (Entra voice mint, S8d),
F8-5 (registry/deploy target), F7-2 reset/verification (mail transport), and
P2-1 CAS (single-writer MVP). P0 (freeze) was out of scope.
