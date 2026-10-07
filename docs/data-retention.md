# Data Retention & Deletion (HLD 7.4, S8b)

Current-state policy. Per-user access control (who may delete whose data)
needs identity and lands with Entra/OIDC in S8c; everything below is enforced
today.

## What is stored where

| Data | Store | Lifetime |
|---|---|---|
| Interviews, assignments, responses, evaluations, events, submissions, runs | Postgres (`pgdata` volume) | Until explicit `DELETE` — no automatic expiry in S8b |
| User accounts (email, display name, password hash) | Postgres `users` | Until account erasure (S8d account-management scope) |
| Login sessions (token hashes only) | Postgres `user_sessions` | 30-day TTL (`AUTH_SESSION_TTL_HOURS`); revoked on logout |
| Problem catalog (300 seeded rows) | Postgres `problems` | Permanent reference data, never user data |
| `users` rows | Postgres `users` | Reserved for S8c auth; unused by services today |
| Tool `call_id` records | Backend memory | 30 min TTL, cap 2000 (frozen §5) |
| Operational counters | Backend memory | Process lifetime (reset on restart) |
| Active voice sessions | Backend memory | Until hangup, DELETE, or interview deletion |

Conversation audio/transcripts are never persisted: the realtime media plane
terminates at Voice Live and the browser (architecture principle 8).

## Erasure

`DELETE /api/interviews/:id` (service-token gated like the rest of `/api`):

- Removes the interview row; Postgres `ON DELETE CASCADE` removes every
  interview-scoped row: assignments, candidate responses, evaluations,
  events, submissions, code runs. Verified by
  `packages/store/tests/persistence.test.ts` ("hard-deletes … cascading").
- Refuses live interviews (`in_progress`/`paused` → 409): end, cancel, or
  fail first, so a running voice session is never pulled out from under the
  model. The backend also drops its voice-session record on delete.
- Audit: the erasure itself is logged (`interview.deleted` with interview id
  + pre-delete status). The interview's own event log is deleted with it —
  the pino server log is the surviving audit trail.
- `GET` reads after delete return 404; a second `DELETE` returns 404.

What erasure does NOT touch: the shared problem catalog, other interviews,
other users' accounts, server logs (operational, no candidate content —
lifecycle/timing only). Deleting an interview never deletes its owner's
account row; full account erasure (user row + sessions) arrives with S8d
account management.

## Encryption & transport (deployment notes)

- At rest: `pgdata` is a plain Docker volume in S8b compose. Production must
  use encrypted managed storage; no application change needed.
- In transit: S8b compose terminates plain HTTP on loopback/published ports
  for local operation. Internet-facing deploys must terminate TLS at the
  reverse proxy / ingress before the backend — the backend never sees
  privileged credentials from the client either way (frozen §7).

## Backups

No automated backup in S8b. `pgdata` is the single durability point; snapshot
the volume before upgrades. Restore semantics: interviews resume from stored
lifecycle state (HLD Phase 2 exit criterion, restart-tested).
