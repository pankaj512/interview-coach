# Audit — Phase 1: Domain Model & Backend Foundation

- **HLD phase:** Phase 1 (Domain model and backend foundation)
- **Implemented in:** S1 (`@interview-coach/domain`), tag `session-1`
- **Source of truth:** HLD §10 Phase 1, §5.1–5.12, §3.1–3.5, §14; frozen §4/§6/§7
- **Scope of this audit:** `packages/domain` S1 core — entities, lifecycle,
  repositories, interview-service, tool-service (initial 4 tools), catalog,
  ids/result/errors. Later additions (selection, hints, evaluation-pipeline,
  submission/service, user-account/session) belong to Phases 5/6/7 and are
  audited there; they are only noted here where they interact with S1 code.

## Exit criteria (HLD, quoted)

> **Exit criteria:** Backend can create and manage an interview without the
> CLI owning authoritative state.

## Checklist vs HLD

### 1.1 Domain entities
- [x] `User`, `Interview`, `InterviewConfiguration`, `Problem`,
      `InterviewProblem`, `CandidateResponse`, `Evaluation`, `InterviewEvent`
      all defined (`user.ts`, `interview.ts`, `problem.ts`, `candidate-response.ts`,
      `evaluation.ts`, `interview-event.ts`).
- [x] `Problem` carries the HLD 5.4 shape (title/difficulty/description/
      constraints/examples/expectedConcepts/sourceLinks/evaluationCriteria).
- [x] Entities are pure data + constructors with validation; no I/O.
- [ ] Runtime validation is complete for every configuration field (see F4).

### 1.2 Lifecycle
- [x] `created/ready/in_progress/completing/completed/cancelled/failed` present.
- [x] Transition table matches frozen §6 (`created → ready → in_progress ⇄
      paused → completing → completed` + `cancelled`/`failed`).
- [x] `transition()` is pure, stamps `startedAt`/`endedAt`/`updatedAt`.
- [x] Terminal states have no outgoing transitions.
- [ ] Multi-problem progression states are modeled (see F2).

### 1.3 API boundaries
- [x] Service surface maps to HLD 1.3 (`createInterview`, `getState`, `start`,
      `beginCompleting`/`complete`, `markReady`, plus `pause/resume/cancel/fail`,
      `assignProblems`, `setCurrentProblem`, `recordResponse`, `recordEvaluation`).
      HTTP exposure is S3's responsibility; the service layer is the Phase-1
      boundary.
- [ ] `assignProblems` rejects degenerate input (see F3).

### 1.4 Tool service
- [x] Initial tools present: `get_current_problem`, `get_interview_state`,
      `get_candidate_performance`, `end_interview`.
- [x] Narrow domain scope; no generic DB/SQL access (frozen §4).
- [x] `end_interview` signals `completing` only; app completes (model signals
      done, app transitions) — matches frozen §6.
- [x] `dispatch` logs `tool.invoked` / `tool.failed`; deterministic.
- [ ] Exhaustive dispatch handling (see F8).

### Cross-cutting Phase-1 principles (HLD §3 / §14)
- [x] Backend owns truth — service mutates state; tools only read/signal.
- [x] Async repo interfaces so S2 swaps Drizzle impls without signature churn.
- [x] Clock injection for deterministic tests.
- [x] `call_id` dedup deferred to S3 voice-service (documented, correct).

## Verification (run this session)

```
pnpm install        # already installed
pnpm typecheck      # ok
pnpm test           # 258 passed (db persistence warn-and-pass w/o Postgres)
pnpm build          # ok (tsc -b)
```

Result: all green. Domain tests: lifecycle (6), interview-service (8),
tool-service (7), catalog (4) — plus later-phase suites.

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| F1 | Major | `interview.ts:31` `InterviewDifficulty = "Easy" \| "Medium" \| "Mixed"` vs `problem.ts:10` `ProblemDifficulty = "Easy" \| "Medium" \| "Hard"`; `selection.ts:16` unions both | 5.1, UI §5 | Two divergent difficulty enums; interview configuration cannot express "Hard" even though problems/selection/UI do. "Mixed" exists only on config, "Hard" only on problem. | Unify to one enum `Easy\|Medium\|Hard\|Mixed` and validate at runtime. |
| F2 | Minor | `interview.ts:66-70` declares `completed`/`skipped`; only `active`/`assigned` are ever produced (`interview-service.ts:176-193, 228-243`) | 5.3/5.4, Phases 4/5 | Problem-level progression (complete current, skip, advance) is declared but not implemented; `currentOrder` + manual `setCurrentProblem` is the only mechanism. | Add `completeCurrentProblem`/`skipProblem`, or drop the unused states until Phase 4/5 needs them. |
| F3 | Minor | `interview-service.ts:165-174` — empty `problemIds` passes the missing-problem check (`0 !== 0` is false) | 1.3, config `problemCount` validation | `assignProblems(id, [])` succeeds, leaving a ready interview with no active problem (`get_current_problem` later errors). | Reject empty assignment. |
| F4 | Minor | `interview.ts:41-64` validates only `durationMinutes`/`problemCount`; `difficulty`/`topicFocus`/`interviewType` are type-only | 1.1/1.3 | Domain config boundary is not self-validating at runtime (relies on S3 zod). Layering inconsistency. | Add runtime validation (difficulty enum, topicFocus non-empty strings + caps, interviewType). |
| F5 | Minor | `tool-service.ts:406-413` caps content at 10k, but `createCandidateResponse` (`candidate-response.ts:28-42`) has no max length | 1.1, 7.5 | The 10k cap is enforced only at the tool layer; direct `recordResponse` (HTTP `POST /responses`) can persist unbounded content unless the backend zod caps it. | Enforce a shared max length in `createCandidateResponse`. |
| F6 | Minor | `evaluation.ts:73-84` iterates dimension keys but only range-checks `score`, not key membership | 1.1, 5.8 | Unknown dimension keys (e.g. `{foo:{score:3}}`) are accepted and persisted. Mitigated by backend zod enum in S5a. | Reject unknown dimension keys in `createEvaluation`. |
| F7 | Minor | `repositories.ts:131-136` in-memory `findByInterview` returns first-inserted; Drizzle returns latest (S2 handoff) | 2.4 | Divergent ordering between unit tests and prod when >1 evaluation exists (single-eval invariant is implicit). | Document invariant + make both return latest. |
| F8 | Nit | `tool-service.ts:200-228` switch has no `default`/`never` check; a name not in the switch leaves `result` undefined → `TypeError` at `result.ok` | 5.5 | Fragile to future tool additions; no current bug (typed `ToolName` + backend gate). | Add an exhaustive `default` that returns an error. |
| F9 | Minor | `interview-service.ts:367-380` `move()` read-modify-write without a version/updatedAt precondition | 2.2, frozen §6 | No optimistic-concurrency guard; concurrent transitions can lose updates or double-record events. Low risk today (single-writer voice session + S3 idempotency). | Add compare-and-swap on `updatedAt`/version at save (S2 transaction). |
| F10 | Nit | `interview-service.ts:245-275` `recordResponse` returns the updated `Interview`, not the created response | 1.3 | Ergonomic wart; callers (tool-service) re-list responses to learn the count. | Return `{ interview, response }` (or the response id). |

## Cross-phase observations (carried forward, not Phase-1 defects)

- `get_candidate_performance` (`tool-service.ts:266-297`) returns only counts +
  `lastRunStatus`, never the candidate's code text. The product requires the
  coach to "have access to code all the time." This is audited properly in
  Phase 5/6 (code surfaced only via S7a `submit_solution`).
- `InterviewDifficulty` missing "Hard" (F1) also blocks the Phase 5 "Hard"
  recommendation/selection path and the UI §5 "Hard" difficulty option — verify
  end-to-end there.

## Handoff to Phase 2 (Persistence)

- Verify S2 Drizzle repos preserve the S1 async interfaces exactly (no
  signature churn) and that `findManyByIds` preserves input order (F7's sibling
  ordering concern applies to problems too).
- Confirm S2 addresses F9 (transactional save / compare-and-swap) and F7
  (latest-evaluation ordering) at the repository layer.
- F2 (multi-problem progression) and F1 (difficulty enum) remain open — they
  are expected to resurface in Phases 4/5.
