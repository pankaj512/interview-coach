# ADR-001 — Local user accounts with per-interview ownership (S8c)

Status: accepted (2026-09-11). Amends no frozen plane; implements HLD 7.1/7.2.

## Context

S8a added a service-level bearer gate (`API_AUTH_TOKEN`) with an open
local-dev mode. HLD Phase 7 requires user authentication and per-user
authorization. The user decided: self-registered accounts now; social sign-in
(Google/GitHub/Microsoft) in Prod (S8d); local dev stays open.

## Decisions

1. **Local email+password credentials now.** scrypt-hashed passwords,
   opaque 32-byte bearer sessions (SHA-256 stored, raw shown once), 30-day
   TTL (`AUTH_SESSION_TTL_HOURS`). No JWT library, no new dependency —
   `node:crypto` only.
2. **Per-interview ownership via `candidateId`.** An interview created by a
   user-authenticated caller is stamped with that user's id (body value
   ignored); every `/api/interviews/:id…` route 404s for other users' ids
   (no existence oracle). Service-token (CLI/admin) callers bypass ownership;
   anonymous callers work only in open mode with client-supplied IDs.
3. **Duplicate registration is a plain 409.** Account-enumeration via this
   signal is accepted pre-prod; login failures stay indistinguishable (401
   `INVALID_CREDENTIALS` either way). Revisit with rate-limit tuning if
   registration is ever abused.
4. **OIDC/social is a second issuer, not a rewrite.** `/api/auth/*` stays the
   local path; S8d adds an issuer that mints the same `user_sessions` rows —
   routes resolve sessions, never issuers.
5. **Pre-S8c `users` rows have no credentials** (nullable columns) and are
   invisible to auth flows.

## Consequences

- New tables `user_sessions` (+ `users.email`/`password_hash`); migration
  `0002`. New routes `POST /api/auth/register|login|logout`; new strict
  rate bucket (`RATE_LIMIT_AUTH_PER_MIN`, 10/min).
- PII note: emails are user data under `docs/data-retention.md` — erased
  only by deleting the account's interviews; account-row erasure itself is
  S8d scope (with social-login account management).
