# Audit — Phase 6: Code Execution & Sandbox

- **HLD phase:** Phase 6 (Code execution and technical evaluation)
- **Implemented in:** S7a + S7b (`@interview-coach/domain` + `@interview-coach/backend` +
  `@interview-coach/web-client`), tags `session-7a/7b`
- **Source of truth:** HLD §10 Phase 6 (6.1–6.4), frozen §4/§5/§8;
  `docs/architecture-frozen.md`; `docs/interview-coach-product-decisions.md`
  (§17 Scoring/Evaluation — "finalized evaluation/scoring algorithm" is explicitly
  *not* a confirmed decision).
- **Scope of this audit:** submission model + service (`submission.ts`,
  `submission-service.ts`), the local runner (`code-runner.ts`), sandbox HTTP
  routes + serializers (`app.ts`, `serializers.ts`), the two sandbox tools
  (`submit_solution`/`run_code` in `tool-service.ts`), and the client surface
  (`CodePanel`, `ExecutionPanel`, `api/types.ts`, `voice/session.ts`). S8a quotas
  that gate the sandbox (concurrency, submission cap, rate bucket) are re-checked
  here because Phase 6 is where they apply.

## Exit criteria (HLD, quoted)

> **Exit criteria:** Candidate code can be evaluated safely. (§10 Phase 6)

## Checklist vs HLD

### 6.1 Submission
- [x] Candidate submits implementation — `submit_solution` tool + `POST
      /api/interviews/:id/submissions`. Code validated (language enum, non-empty,
      ≤50k chars), persisted as backend-owned state, `code.submitted` event.
- [x] Status gating — submit allowed in `ready/in_progress/paused/completing`,
      rejected in `created/cancelled/failed/completed`.
- [ ] `problemId` is carried but not validated against the interview's problems
      (see F6-6).

### 6.2 Sandbox
- [x] Execution timeout — wall-clock kill via `execFile` `timeout`
      (`code-runner.ts:207-257`), default 5s, 100ms..30s.
- [~] Filesystem isolation — fresh temp dir per run, `rm -rf` after
      (`code-runner.ts:150-172`). Partial: it is a *private* cwd, not an isolated
      filesystem — the child can still read the whole container FS.
- [x] Output caps — `maxBuffer` (1 MiB) + per-case `maxActualChars` (20k).
- [ ] **CPU limits** — not implemented.
- [ ] **Memory limits** — not implemented.
- [ ] **Network restrictions** — not implemented.
- [ ] **Process isolation** — not implemented (no namespaces/cgroups; subprocess
      of the backend, inheriting its environment).

### 6.3 Tests
- [x] Visible + hidden cases run; hidden actuals masked end-to-end (pass/fail
      only, `submission.ts:264-273` + `serializers.ts:145-163`).

### 6.4 Evaluation integration
- [~] Execution *evidence* reaches the model (`get_candidate_performance` +=
      `submissionCount`/`lastRunStatus`, `tool-service.ts:283-296`; mint
      `sandboxSummary`, `app.ts:1206-1215`) and the Results screen
      (`ExecutionPanel`) for human scoring. But there is **no automated**
      combination of run verdicts with `overallScore`/recommendation, and the
      `evaluate_solution` tool (frozen §4) is not implemented (see F6-2).

### Cross-cutting (frozen §4/§5)
- [x] Tools stay narrow; no generic DB access; model output never becomes state.
- [x] `call_id` idempotency applies to the sandbox tools via the shared
      `tool-exec` path (singleflight shares an in-flight run; replays safe).
- [~] S8a sandbox quotas (concurrency, submission cap, `codeRun` bucket) apply
      only to the HTTP client routes, not the model tool path (see F6-3).

## Verification (run this session)

```
pnpm typecheck   # ok (tsc --noEmit)
pnpm test        # 258 passed (36 files) — persistence warn-and-pass w/o Postgres
pnpm build       # ok (tsc -b)
pnpm --filter @interview-coach/web-client build   # ok (314.45kB JS / 96.60kB gzip)
```

Result: all green. S7-relevant suites: domain `sandbox` (7), `submission-service`
(5), `tool-service-s7` (10); backend `sandbox` (12, incl. real JS+Python pass,
wrong-code fail + hidden masking, infinite-loop timeout kill, cross-interview
404); client `backend-client-s7` (2), `code-panel` (5), `session`/`voice-client`
(9 tools). No-DB run; the S7a/S7b live-DB smokes were verified in their sessions.

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| F6-1 | Critical | `code-runner.ts:1-11,207-257`; `config.ts:117-124`; `submission.ts:264-273`; `serializers.ts:151-156` | 6.2 | **The sandbox is not a sandbox.** `LocalCodeRunner` runs untrusted candidate code as a subprocess of the backend via `execFile` with no `env` override, no CPU/memory/network/process limits, and a `cwd` that is only a private temp dir (not an isolated filesystem). The child inherits the backend's full environment — `DATABASE_URL`, `API_AUTH_TOKEN`, and in local-dev `AZURE_VOICE_API_KEY` — and can read the whole container filesystem and open network connections. Concretely: `solve = () => process.env.AZURE_VOICE_API_KEY` returns the key as the `actual` of a *visible* case, which is then persisted (`submission.ts:271`) and returned to the model. CPU/memory/network/process isolation (all four named in 6.2) are absent; the runner's own header says "this is NOT a security boundary". The S7a/S8a handoffs deferred container isolation to S8b, but S8b shipped only backend/web/db Dockerfiles — the runner still executes in-process. The Phase-6 exit criterion "candidate code can be evaluated safely" is **unmet**. | Real per-run isolation: a dedicated sandbox container per run (or gVisor/Firecracker) with CPU+memory quotas, `--network=none`, read-only rootfs, and a scrubbed env. Short-term mitigations before that: scrub `env` to a fixed allowlist, drop privileges (nobody/`setuid`), and set `rlimit` CPU/mem. Until then, gate the runner behind an explicit non-production flag the same way api-key voice mode is local-dev-only (V3-5 pattern). |
| F6-2 | Major | `tool-service.ts:44-65` (no `evaluate_solution`); `evaluation-pipeline.ts` (dimensions-only); `ExecutionPanel.tsx` | 6.4, frozen §4:33 | **HLD 6.4 "combine execution results with conversational evaluation" is not implemented.** No tool/route folds run verdicts into the evaluation. `get_candidate_performance` surfaces counts/status only; `finalizeEvaluation` accepts `dimensions` as the sole score input and the only client "integration" is a read-only evidence card. `evaluate_solution` (listed in frozen §4 as a Phase-6 tool) is absent from `TOOL_NAMES`, so the model cannot be asked to score code either. The Phase-5 handoff explicitly flagged this and it remains open. | Decide the scoring policy over `ExecutionSummary` (the deterministic pass/rate/status already persisted) and wire it into `finalizeEvaluation` or a new `evaluate_solution` tool — but first land I5-1, since it lives on the same `finalizeEvaluation` entry point. |
| F6-3 | Major | `app.ts:902-911` (submission cap), `app.ts:973-997` (concurrency semaphore); `rate-limit.ts:95-99` (bucket by route); `tool-service.ts:437-528` | 6.2, frozen §5 | **S8a sandbox quotas/limits are bypassed on the model (tool) path.** `CODE_RUN_MAX_CONCURRENT` and `CODE_RUN_MAX_SUBMISSIONS_PER_INTERVIEW` are enforced only inside the HTTP routes; `submit_solution`/`run_code` via `tool-exec` call `SubmissionService.submit`/`runTests` directly, so the model — the primary sandbox caller — can run unlimited concurrent subprocesses and unlimited submissions. Likewise `bucketForRoute` sends `POST .../tool-exec` to the looser `toolExec` bucket (120/min) and only the HTTP runs route to `codeRun` (30/min), so the model's `run_code` never hits the tighter budget. | Enforce concurrency + submission cap inside `SubmissionService` (single enforcement point shared by route and tool), and bucket sandbox tools by tool name (e.g. a `codeRun` budget on `run_code`/`submit_solution` tool-exec) rather than by URL shape. |
| F6-4 | Minor | `submission-service.ts:161-179`; `DEFAULT_RUN_TIMEOUT_MS=5000`, `MAX_RUN_TIMEOUT_MS=30000`; frozen §5 (8s forwarder timeout) | 6.2, 6.3 | **A slow run blocks the `tool-exec` request synchronously for up to 30s.** The browser forwarder's 8s timeout is shorter than the max run time, so a run that exceeds ~8s will time out the forwarder (its singleflight retries share the same in-flight promise and also time out); the verdict is persisted but the model never receives it conversationally. The realtime tool path is meant for fast, deterministic reads. | Execute runs off the request path and expose a pollable `run` (or cap the tool-path `timeoutMs` below the forwarder window), or accept a run and have the model read `get_candidate_performance`/runs afterwards. |
| F6-5 | Nit | `code-runner.ts:50-60` | 6.3 | **`NaN`/`Infinity` canonicalize to `"null"` in the JS harness.** `JSON.stringify(NaN/Infinity)` → `"null"`, so a candidate returning `NaN` (e.g. a divide-by-zero bug) compares equal to a case expecting `null` and "passes". Correctness edge case with no safety impact. | Treat non-finite numbers explicitly in `canon` (or serialize via a replacer that throws/represents them distinctly). |
| F6-6 | Nit | `submission-service.ts:86-94`; `tool-service.ts:456-465` | 6.1 | **`problemId` is accepted but never checked against the interview's assigned problems.** Any non-empty string is carried through, so a submission can reference a problem not in the interview (mirrors I5-6 for `record_candidate_answer`). Harmless today (the id is only ever echoed back), but it weakens "backend owns truth" if evaluation later keys off it. | Validate `problemId` against `interview.problems`, or drop the field until it is used. |

## Cross-phase observations (carried forward, not Phase-6 defects)

- **I5-1 (Major, evaluation downgrade)** is still open and is a prerequisite for
  F6-2: any scoring-over-runs will build on `finalizeEvaluation`, which currently
  ignores the stored hint count when the caller omits `hintsUsed`. Fix it first.
- **I5-4 (hint-only evaluation rows)** now has a second surfacing point: the
  `ExecutionPanel` sits directly above the finalize form, so the "scored vs
  hint-accounting" distinction matters when a hint-only evaluation row exists.
- **F2 / I5-3 (`setCurrentProblem` route/UI)** becomes a real Phase-6 blocker the
  moment a "problem → submit → run → next problem" loop is wired: submissions/runs
  attach to `problemId`, but there is no way to advance to a second problem.
- **C4-2 (429 `retryable:true` never retried)** is directly relevant to F6-3: once
  the `codeRun` budget is applied to the model path, the forwarder must actually
  back off on `429 retryable:true` or the model will surface quota 429s as
  permanent tool failures.
- **V3-5 (api-key voice mode leaks the long-lived key)** has a sandbox analogue in
  F6-1: both are "local-dev-only by convention, not enforced in code". Fix them
  together with a shared production-mode guard.

## Handoff to Phase 7 (Security hardening)

- F6-1 is the highest-value finding and is the single point where Phase 6's exit
  criterion ("safely") is failed. It is a security boundary, so it naturally
  belongs to Phase 7 — but it must not be dropped: HLD 6.2 lists all four
  isolation dimensions, and "container isolation" has now been deferred twice
  (S7a→S8b, and S8b shipped without it).
- F6-3 (quota/limit enforcement on the tool path) is also Phase-7-shaped; it is a
  one-line-per-limit fix once enforcement moves into `SubmissionService`.
- F6-2 (scoring-over-runs) depends on the open "scoring model" product decision
  (`product-decisions.md` §17) — do not invent a scoring algorithm unilaterally;
  surface the decision first.

Carried-forward inventory (open at Phase 6 close): F1, F2, F3, F4, F5, F6, F7,
F8, F9, F10 (Phase 1); P2-1 … P2-8 (Phase 2); V3-1 … V3-6 (Phase 3); C4-1 …
C4-8 (Phase 4); I5-1 … I5-7 (Phase 5); F6-1 … F6-6 (this phase).
