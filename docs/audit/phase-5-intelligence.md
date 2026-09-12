# Audit — Phase 5: Interview Intelligence

- **HLD phase:** Phase 5 (Interview intelligence)
- **Implemented in:** S5a + S5b (`@interview-coach/domain` + `@interview-coach/backend` +
  `@interview-coach/web-client`), tags `session-5a/5b`
- **Source of truth:** HLD §10 Phase 5 (5.1–5.5), §5.2 (backend), §5.4 (problem
  repo), §5.5 (tool layer), §5.8 (evaluation), §14; frozen §2/§4/§5;
  `dsa-problem-catalog.json`; `docs/interview-coach-product-decisions.md` (§6/§7
  interviewer-vs-coach split). S7a sandbox tools ride the same tool path but are
  Phase 6 scope (audited separately).
- **Scope of this audit:** problem selection (`selection.ts`, auto-select route),
  structured context (`get_interview_configuration` + instructions builder),
  hint policy (`hints.ts`, `get_problem_hint`, `recordHint`), the evaluation
  pipeline (`evaluation-pipeline.ts`, `POST .../evaluation`, `EvaluationForm`),
  and the client surface (`HintPanel`, `AnswerForm`, `EvaluationForm`, `SetupScreen`
  selection/browser). The carried-forward F1/F2 difficulty/progression items are
  re-checked here because Phase 5 was their designated fix point.

## Exit criteria (HLD, quoted)

> **Exit criteria:** The product consistently behaves like an interviewer rather
> than merely answering the problem. (§10 Phase 5)

## Checklist vs HLD

### 5.1 Interview configuration
- [x] Interview type — `interviewType: "dsa"` (single live format; System design
      disabled "Soon" in `SetupScreen`).
- [x] Difficulty — config pill (Easy/Medium/Mixed) + browser/select filter.
      **Split remains** (see I5-2/F1).
- [x] Duration — clamped 1..480 min in `configurationSchema`.
- [x] Problem selection — `GET /api/problems` browser + `POST .../problems/select`
      deterministic auto-select (`selection.ts`), manual id / browser picker.
- [x] Interviewer configuration — `get_interview_configuration` tool + structured
      instructions from the backend-owned config.
- [x] Evaluation criteria — 8 HLD 5.8 dimensions surfaced to the model/UI.

### 5.2 Structured context
- [x] `get_interview_configuration` returns backend-owned config + status + problem
      count + current problem id (`tool-service.ts:324`).
- [x] Mint instructions carry configuration/problem/progress summaries
      (`buildSessionInstructions`, `describeConfiguration`/`describeProblem`).

### 5.3 Adaptive follow-ups
- [~] No dedicated mechanism; relies on model behavior from the conduct block
      ("probe reasoning before giving hints", "ask one question at a time"). The
      hint ladder is the only structured follow-up affordance. Acceptable for the
      MVP but "adaptive" is effectively prompt-instructed, not tool-enforced.

### 5.4 Hint policy
- [x] 3-tier deterministic hints (`hints.ts`), level defaults to `nextHintLevel`,
      capped at 3, `revealsSolution:false` always.
- [x] Every hint increments backend-owned `hintsUsed` + `hint.issued` event.

### 5.5 Evaluation pipeline
- [x] Structured post-interview evaluation, persisted separate from conversation.
- [x] `POST .../evaluation` computes `overallScore` + derives `recommendation`
      (85/70/50 bands, ≥3-hint downgrade), explicit inputs win.
- [x] Evaluation allowed while running and after completion.
- [ ] **Downgrade integration broken** in the primary path (see I5-1).

### Cross-cutting (frozen §4/§5)
- [x] Tools stay narrow; no generic DB access; model output never becomes state.
- [x] UI hint path reuses `tool-exec` (no dedicated hint endpoint); each click is a
      new `call_id` → a new counted hint.
- [~] frozen §5 `retryable:true` still not honored (C4-2, carried forward — the
      `get_problem_hint` UI path is a second victim of the same bug).

## Verification (run this session)

```
pnpm typecheck   # ok (tsc --noEmit)
pnpm test        # 258 passed (36 files) — persistence warn-and-pass w/o Postgres
pnpm build       # ok (tsc -b)
pnpm --filter @interview-coach/web-client build   # ok (314.45kB JS / 96.60kB gzip)
```

Result: all green. S5-relevant suites: domain `selection` (6), `hints` (3),
`evaluation-pipeline` (4), `tool-service-s5` (6); backend `intelligence` (14);
client `backend-client-s5` (5), `voice-args` (4, since 7-tool count was later
extended by S7b). No-DB run; the S5a live smoke was already verified against
postgres:16 in its session.

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| I5-1 | Major | `app.ts:857-881`; `evaluation-pipeline.ts:78-96` | 5.5, 5.8 | **The heavy-hint recommendation downgrade never fires in the primary finalize path.** When the caller omits both `hintsUsed` and `recommendation` (exactly what `EvaluationForm.tsx` does — it sends only `dimensions`/`strengths`/`weaknesses`), `finalizeEvaluation` derives the recommendation with `hintsUsed` defaulted to 0, *before* the route reads the stored hint count. The route then corrects the stored `hintsUsed` (line 869-873) but does not recompute the recommendation. Empirically reproduced: dimensions 90 → recorded `{overallScore:90, recommendation:"hire", hintsUsed:3}` where the correct value is `lean_hire`. Domain `deriveRecommendation` is unit-tested (`evaluation-pipeline.test.ts:21`), but no test covers the omitted-`hintsUsed` route path — `intelligence.test.ts:149` only pins the explicit-score case, and `:130` has 0 hints so the downgrade is moot. | Resolve the effective `hintsUsed` (stored when omitted) *before* deriving the recommendation, e.g. compute `finalized` with the resolved hint count, or re-derive `recommendation = deriveRecommendation(finalized.overallScore, resolvedHintsUsed)` when `parsed.data.recommendation` is undefined. Add a route test: 3+ stored hints, omitted `hintsUsed`/`recommendation` → downgraded band. |
| I5-2 | Minor | `interview.ts:31`; `app.ts:121,168`; `api/types.ts:34,156,173`; `SetupScreen.tsx:15,92` | 5.1 | **Carried-forward F1 (verified still open).** Difficulty enum is split three ways: config = `Easy\|Medium\|Mixed`, browser filter = `Easy\|Medium\|Hard`, auto-select body = `Easy\|Medium\|Hard\|Mixed`. A "Hard" interview is unreachable from the configuration/UI (config schema rejects "Hard"), while "Mixed" exists only as a config target. Phase 5 was the designated unification point but added a third enum (`selectProblemsSchema`) instead. | Unify to one `Easy\|Medium\|Hard\|Mixed` enum across domain `InterviewDifficulty`, `configurationSchema`, `selectProblemsSchema`, and the client types + pills. |
| I5-3 | Minor | `interview-service.ts:198` (domain `setCurrentProblem`) vs no route in `app.ts` (route scan); `SetupScreen.tsx:76` allows `problemCount` ≤ 20 | 5.1, 5.3 | **Carried-forward F2 (verified still open).** Auto-select with `problemCount > 1` assigns N problems but only order 0 is active; there is no HTTP route or UI to advance `currentOrder`, and `ProblemPanel` shows only the single `currentProblem`. A >1-problem interview is still effectively single-problem, so "adaptive follow-ups" across problems cannot happen. | Expose `setCurrentProblem` (or advance/skip/complete) as a service + route + UI, or cap `problemCount` to 1 and state the single-problem MVP explicitly. |
| I5-4 | Minor | `interview-service.ts:331-344`; `tool-service.ts:292-295`; `serializers.ts:94-95` | 5.5, 5.8 | **`hasEvaluation` is true after the first hint, before any scoring.** `recordHint` creates a dimensions-empty evaluation row when none exists, so `get_candidate_performance` reports `hasEvaluation:true` and the state snapshot returns a non-null `evaluation` (empty `dimensions`, `overallScore` undefined) once a single hint is issued. Results/performance read this as "evaluated". | Treat `hasEvaluation` as "has any dimension score" (or add a distinct `hintsUsed`/`scored` flag) so a hint-only evaluation row is not presented as a completed evaluation. |
| I5-5 | Nit | `api/types.ts:71` | 5.8 | **Stale `SerializedEvaluation.dimensions` type.** Still `Record<string, {score,notes} \| number>`; the backend always serializes `{score,notes}` objects now (`serializers.ts:72`). The `\| number` union is dead and misleading (S5b claimed this fix). | Drop the `\| number` arm. |
| I5-6 | Nit | `session.ts:78-87` vs `tool-service.ts:414-423` | 5.5 | **Voice `record_candidate_answer` schema omits `problemId`.** The tool accepts an optional `problemId`, but the advertised voice schema has no such property, so the model can never attach an answer to a specific problem over the voice path. | Add `problemId: {type:"string"}` to the tool schema. |
| I5-7 | Nit | `interview-service.ts:318-322` | 5.4 | **Hints allowed while `completing`.** `recordHint` permits `completing` (but not `completed`), so a hint can be counted after the model has signalled done. Consistent with `recordEvaluation`-on-`completing`, but a post-wrap-up hint is odd. | Either restrict hints to `in_progress`/`paused`, or leave as-is and document the intentionality. |

## Cross-phase observations (carried forward, not Phase-5 defects)

- **C4-2 (429 `retryable:true` never retried)** is still open and now has two
  victims: the model path *and* the S5 UI hint path (`HintPanel.tsx:46` drives
  `toolExec`, which hardcodes `retryable:false` at `backend-client.ts:292`). When
  fixed, confirm the UI-generated `call_id` path and the model path both back off
  identically (the S8a rate limiter sends `429 RATE_LIMITED retryable:true`
  expressly for this).
- **Transcript persistence** (raised in Phase 4): canonical answer text is
  `POST .../responses` + `record_candidate_answer`, both now wired; the Results
  "highlights" still reflect only the latest in-session turns. Cross-session
  transcript remains open (needs a `GET /api/interviews` listing + transcript
  store), already deferred in S6.1 — not a Phase-5 blocker.

## Handoff to Phase 6 (Code execution & sandbox)

- I5-1 is the highest-value fix in this phase and is a pure backend change
  (`app.ts` evaluation route); it should land before the S7 evaluation-over-runs
  scoring policy is designed, because Phase 6 (HLD 6.4 "combine execution results
  with conversational evaluation") will build on the same `finalizeEvaluation`
  entry point and would otherwise inherit the downgrade bug.
- I5-2/I5-3 (F1/F2) remain the shared selection/progression surface; if Phase 6
  wires "problem → submit → run → next problem" flow, the missing `setCurrentProblem`
  route/UI (I5-3) becomes a Phase-6 prerequisite rather than a Phase-5 leftover.
- The evaluation pipeline expects `dimensions` as the sole score input; Phase 6
  must decide how `run_code` verdicts (pass/fail/timeout) feed `overallScore`
  without violating "explicit inputs win" (pipeline `finalizeEvaluation`).
- I5-4 (hint-only evaluation rows) will surface again in the Phase-6 results
  panel, which shows execution evidence above the finalize form; keep the
  "scored vs hint-accounting" distinction when rendering.

Carried-forward inventory (open at Phase 5 close): F1, F2, F3, F4, F5, F6, F7,
F8, F9, F10 (Phase 1); P2-1 … P2-8 (Phase 2); V3-1 … V3-6 (Phase 3); C4-1 …
C4-8 (Phase 4); I5-1 … I5-7 (this phase).
