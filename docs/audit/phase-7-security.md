# Audit — Phase 7: Security Hardening

- **HLD phase:** Phase 7 (Security hardening: 7.1–7.5)
- **Implemented in:** S8a + S8c (`@interview-coach/backend` + `@interview-coach/domain` +
  `@interview-coach/web-client`), tags `session-8a/8c`. S8b (retention/delete +
  deploy) is Phase 8's scope but is re-checked where HLD 7.4 "data protection"
  touches it.
- **Source of truth:** HLD §10 Phase 7 (7.1–7.5), frozen §4/§7; `docs/adr-001-user-auth.md`;
  `docs/data-retention.md`; `docs/interview-coach-product-decisions.md` (§13 Security).
- **Scope of this audit:** the service auth gate + ownership (`auth.ts`), local
  account service (`users.ts`), the owned rate limiter (`rate-limit.ts`), quota
  enforcement (`app.ts`), secret handling across the voice/runner seams
  (`voice-session.ts`, `code-runner.ts`), and the client session/auth surface
  (`backend-client.ts`, `auth-store.ts`). The Phase-6 handoff explicitly pushed
  three security-boundary items into this phase (F6-1, F6-3, V3-5), so those are
  re-checked here rather than left dangling.

## Exit criteria (HLD, quoted)

> **Exit criteria:** Security boundaries are explicit and tested. (§10 Phase 7)

## Checklist vs HLD

### 7.1 Authentication
- [x] User authentication — S8c self-registered email+password (`POST
      /api/auth/register|login|logout`), scrypt-hashed passwords, opaque 32-byte
      bearer sessions stored as SHA-256 (`users.ts:59-92`).
- [x] Service authentication — optional `API_AUTH_TOKEN` bearer gate for
      CLI/admin (`auth.ts:64-93`), timing-safe compare.
- [x] Credential brute-force throttled — strict `auth` rate bucket 10/min,
      applied before auth (`rate-limit.ts:93-94`, `app.ts:341-355`).
- [~] Password policy — min 8 / max 128, but the KDF parameters sit below the
      OWASP floor and there is no lockout/reset path (see F7-1, F7-2).

### 7.2 Authorization
- [x] Per-interview ownership — a user-authenticated caller may only touch
      interviews whose `candidateId` is their own id; foreign/missing both read
      404 (`auth.ts:99-114`); create stamps identity from the session, body value
      ignored (`app.ts:496-500`).
- [x] Service token bypasses ownership (CLI/admin); anonymous only in open
      local-dev mode — both tested (`users.test.ts:178-262`).
- [ ] No production fail-safe: with `API_AUTH_TOKEN` unset, ownership is
      silently off for every caller (see F7-4).

### 7.3 Secrets
- [x] No secrets in source, bundles, or logs — CI bundle scans (S8b) + hygiene
      tests (`hardening.test.ts:321-348`) verify the voice key never appears in
      error bodies; `VITE_`-free client bundle.
- [x] Azure credentials server-side; browser only receives a minted credential
      (`voice-session.ts:3-14`).
- [ ] Candidate code still inherits the backend's full environment, so the
      sandbox path can read `AZURE_VOICE_API_KEY`/`API_AUTH_TOKEN`/`DATABASE_URL`
      (F6-1, re-checked below).
- [ ] api-key voice mode returns the long-lived key verbatim (V3-5, re-checked).

### 7.4 Data protection
- [x] Retention/deletion — `DELETE /api/interviews/:id` hard-erases with cascade;
      live interviews refused; audit log (`app.ts:675-689`,
      `docs/data-retention.md`).
- [~] Encryption — at rest delegated to managed storage; in transit to the
      reverse proxy (deployment notes in `data-retention.md:45-52`); no
      application change, but no enforcement either.
- [ ] Account erasure — still S8d scope (user row + sessions + owned interviews);
      `data-retention.md:12,39-43` documents it as open.

### 7.5 Abuse protection
- [x] Rate limits — owned fixed-window per-IP: global 1000/min + tool-exec
      120 + voice-mint 60 + code-run 30 + auth 10 (`rate-limit.ts:87-100`,
      `config.ts:110-116`); 429 uses the shared `{ok:false}` envelope with
      `retryable:true` + `Retry-After`.
- [x] Session/quota limits — `VOICE_MAX_ACTIVE_SESSIONS` (200),
      `CODE_RUN_MAX_CONCURRENT` (4), `CODE_RUN_MAX_SUBMISSIONS_PER_INTERVIEW`
      (100), 256 KB body cap (`app.ts:287,973-997,902-911`).
- [~] The sandbox quotas are enforced only on the HTTP routes, not the model
      tool path (F6-3, re-checked below); the forwarder never retries the
      `retryable:true` 429s it was designed for (C4-2, re-checked below).

### Cross-cutting (frozen §4/§7)
- [x] Tools stay narrow; no generic DB access; model output never becomes state.
- [x] Secrets remain server-side; client has no Azure SDK/credentials.
- [~] "Credentials server-side" is undercut by the un-isolated sandbox, which
      turns *any* authenticated candidate into a code-execution path that can
      read every server-side secret (F6-1).

## Verification (run this session)

```
pnpm typecheck   # ok (tsc --noEmit)
pnpm test        # 258 passed (36 files) — persistence warn-and-pass w/o Postgres
pnpm build       # ok (tsc -b)
pnpm --filter @interview-coach/web-client build   # ok (314.45kB JS / 96.60kB gzip)
```

Result: all green. Security-relevant suites: backend `hardening` (14: auth gate,
metrics counting, session/submission caps, tool-exec 429 envelope, 413 body cap,
helmet header, secret non-leak, delete flow, prometheus shape) and `users`
(8: hashing round-trip, register/login/logout, session expiry + cleanup, uniform
401s, email/hash hygiene, ownership incl. spoof-override + service bypass +
open-mode compat); client `backend-client-s8` (3) + `backend-client-s8c` (5).
No-DB run; the S8a/S8c live-DB smokes (token-gated + ownership + secret hygiene)
were verified in their sessions (port 5433/3220), not reproduced here because no
Postgres is up.

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| F7-1 | Minor | `users.ts:30-34` (`SCRYPT_N=16384`) | 7.1 | **scrypt cost is below the OWASP floor.** `N=16384` is 2^14; OWASP's scrypt guidance is N=2^17 (r=8, p=1), with 2^15 commonly cited as the absolute floor. 2^14 is fast enough that offline attack on a leaked hash is meaningfully cheaper than it should be. Everything else about the credential path is sound (per-password salt, timing-safe compare, no plaintext). | Raise `SCRYPT_N` to 2^15..2^17 (tune for target login latency) and bump the version tag in the hash format to invalidate old hashes, or migrate to Argon2id if a dependency is ever acceptable. |
| F7-2 | Minor | `users.ts:129-171`; `rate-limit.ts:93-94`; ADR-001 §3 | 7.1 | **No account lockout, password reset, or email verification.** Brute force is slowed only by the 10/min per-IP auth bucket; there is no per-account throttle/lockout and no recovery path, so a forgotten password means a dead account. Registration enumeration (409 on duplicate) is ADR-accepted pre-prod, but the *recovery* gap is not called out anywhere as open. | Add a per-account failed-attempt counter + lockout, and a reset/verification flow (needs a mail transport or a seeded-admin reset in the meantime). Record the enumeration trade-off as an explicit open item in `data-retention.md`/ADR. |
| F7-3 | Minor | `users.ts:85-92`; `auth-store.ts:7,93-102`; `config.ts:88-90` | 7.1, 7.3 | **Long-lived bearer in `localStorage`, 30-day TTL.** The session token is a 256-bit secret stored in `localStorage` (XSS-exfiltratable) with a 30-day default TTL. React auto-escaping keeps the XSS surface small, and the header-based bearer avoids CSRF, but this is the weakest link in the credential chain and the TTL is long for a stored bearer. | Shorten the default TTL (e.g. 7 days + sliding renewal) and, when the client's CSP matures, consider an HttpOnly cookie for the web client (with CSRF protection) while keeping the bearer for CLI/service callers. |
| F7-4 | Major | `auth.ts:65-67,88-91`; `app.ts:358-366`; no `NODE_ENV`/prod guard anywhere | 7.1, 7.2 | **Open local-dev mode is the default with no production fail-safe.** When `API_AUTH_TOKEN` is unset, every `/api` route is reachable anonymously and the ownership hook passes `anonymous` callers straight through (`auth.ts:88-91`), so *all* interviews are readable/deletable by *anyone* — HLD 7.2 ("users can access only their own interviews") silently disappears. The only signal is a single startup `warn` (`auth.ts:65-67`). A production deploy that forgets one env var runs fully open and un-owned, and nothing in the code path refuses it. Same "convention-not-enforced" shape as V3-5. | Refuse to start (or force a deny-closed gate) when running in a production context without an auth mechanism — e.g. fail closed if `NODE_ENV === "production" && !API_AUTH_TOKEN`, or require an explicit `ALLOW_ANONYMOUS=true` opt-in. Land it together with the V3-5 guard since both are "local-dev-only by convention". |
| F7-5 | Nit | `auth.ts:47-54` | 7.1 | **`timingSafeEqual` short-circuits on length.** `if (a.length !== b.length) return false` is a length oracle. Harmless for a 256-bit random bearer, but it is not actually constant-time. | Pad/compare fixed-length digests (hash both sides first) so the comparison is length-independent. |
| F7-6 | Nit | `auth.ts:103-114` | 7.2 | **Ownership hook re-fetches the interview every request.** Every user-authenticated `/api/interviews/:id…` request reads the interview in the `preHandler` (to enforce ownership) and the handler reads it again — two DB round-trips, plus a tiny window where the two reads can disagree. | Attach the resolved interview to `request` in the ownership hook and let handlers reuse it, or accept the extra read and document it. |

## Security findings carried into Phase 7 (re-checked, still open)

These were recorded in earlier phases and were handed to Phase 7 because they are
security boundaries. Re-verified against current code — all still open and now
explicitly Phase 7's responsibility.

| ID | Status | Evidence (refreshed) | Why it is still open |
|---|---|---|---|
| F6-1 (Critical) | open | `code-runner.ts:217-225` — `execFile` with no `env` override; harness `require("./submission.js")` executes arbitrary code; no network/CPU/mem/process limits | Phase 7 is the phase whose *entire purpose* is "candidate code can be evaluated safely" (and 7.3/7.4/7.5 all touch it), yet S8a/S8c shipped no change here. The runner still inherits `DATABASE_URL`, `API_AUTH_TOKEN`, `AZURE_VOICE_API_KEY`; `solve = () => process.env.AZURE_VOICE_API_KEY` still exfiltrates the key into a persisted visible case. |
| F6-3 (Major) | open | `tool-service.ts:466-479` (`submitSolution`), `515-519` (`runCode`) call `SubmissionService` directly — no `maxConcurrentRuns`/`maxSubmissionsPerInterview`; `rate-limit.ts:95-99` sends `tool-exec` to the loose `toolExec` bucket | Quotas are still HTTP-route-only; the model (the primary sandbox caller) bypasses concurrency, submission, and the tighter `codeRun` budget. |
| V3-5 (Minor) | open | `voice-session.ts:58-80,104-114` — `ApiKeyLocalDevVoiceSessionProvider` returns `this.apiKey` verbatim; no `NODE_ENV`/`VOICE_PROVIDER` guard | Still local-dev-only by convention; a stray `AZURE_VOICE_API_KEY` in prod leaks the long-lived key to every mint. Compounds F6-1 (the key is also readable by candidate code). |
| C4-2 (Major) | open | `tool-forwarder.ts` `isRetryableFailure` still returns false for non-ok; `backend-client.ts` `ToolExecFailure.retryable` still hardcoded false | The forwarder never honors the `429 retryable:true` + `Retry-After` contract the S8a limiter was built around, so abuse-protection 429s surface to the model as permanent tool failures and backoff is dead code. |

## Cross-phase observations (carried forward, not Phase-7 defects)

- **F7-4, V3-5, F6-1** share one root cause — *local-dev-only by convention,
  not enforced in code* — and should be fixed together as a single
  "production-mode guard" sweep (refuse anonymous auth, refuse api-key voice,
  refuse the in-process runner when not explicitly local-dev).
- **I5-1 (Major, evaluation downgrade)** remains open and is the prerequisite for
  F6-2 (scoring-over-runs): both build on `finalizeEvaluation`, which still
  ignores the stored hint count when the caller omits `hintsUsed`.
- **C4-2** is now a Phase-7 correctness matter (the limiter's `retryable:true`
  contract is meaningless until the forwarder honors it); it also gates F6-3's
  fix — once `codeRun` budgets apply to the model path, the model will see quota
  429s as permanent failures unless C4-2 lands first.
- **F7-2** (no password reset) interacts with the open account-erasure item: S8d
  owns full account management (erasure + social + reset) — do not build a
  one-off reset path that S8d then has to unwind.

## Handoff to Phase 8 (Production deployment)

- **F6-1 is the single highest-value open item in the entire build and is the
  Phase-7 exit criterion ("safely") failing the hardest.** It has now been
  deferred three times (S7a→S8b, S8b shipped without it, S8a/S8c shipped without
  it). Container isolation belongs to the S8b/Phase-8 track in the plan, so it
  *can* be handed forward — but it must be handed forward as a **blocking** item,
  not another convention: an internet-facing deploy with this runner is remote
  code execution with full secret access. Interim mitigations (scrub `env` to an
  allowlist, drop privileges, `rlimit` CPU/mem, `--network=none` container) must
  land before any internet exposure, even before the full sandbox story.
- **F7-4 + V3-5** (prod fail-safe) are one-line-per-item hardening that should
  precede the Phase-8 release step: no production image should boot with open
  auth, api-key voice, or the in-process runner unless explicitly allowed.
- **F6-3 + C4-2** are backend/client quota-contract fixes that Phase 8's
  monitoring (rate-limit → forwarder backoff → model) depends on for sane
  production behavior under load.
- **F7-1/F7-2/F7-3** (KDF cost, lockout/reset, session TTL) are polish that can
  ride along with S8d account management, but F7-1 is worth doing before any real
  user data accumulates.

Carried-forward inventory (open at Phase 7 close): F1 … F10 (Phase 1); P2-1 …
P2-8 (Phase 2); V3-1 … V3-6 (Phase 3); C4-1 … C4-8 (Phase 4); I5-1 … I5-7
(Phase 5); F6-1 … F6-6 (Phase 6); F7-1 … F7-6 (this phase).
