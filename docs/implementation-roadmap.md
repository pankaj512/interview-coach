# Interview Coach — Implementation Roadmap (Phases 1–16)

> **Status:** approved architecture, **not yet implemented**. This document is the
> handoff so any session can continue without re-deriving the design.
>
> **Origin:** the target architecture was provided by the product owner in 15
> parts (see `docs/SESSION_HANDOFF.md` → "Learning-loop architecture"). Phase 16
> is the only added phase and introduces **no new product functionality**.
>
> **Relationship to existing docs:** this roadmap **amends** the HLD
> (`interview-coach-hld-and-implementation-plan.md`) and
> `docs/architecture-frozen.md`. Phase 1 lands those amendments + ADR-002. Until
> Phase 1 is done, the HLD/frozen docs still describe the pre-learning-loop
> architecture; treat this roadmap as the intended target.

## How to use this document

- Phases are ordered and dependencies are explicit. Implement sequentially;
  do not start a phase until its dependencies are done.
- Every phase lists: Objective · Why · Dependencies · Inspect/reuse · Backend ·
  Frontend · DB/migration · LLM · Voice Live · API · Tests · Acceptance ·
  Risks · **Not included** · Sub-phases.
- The **architectural constraints** and **locked decisions** below are binding.

---

## Canonical architecture

```
Web Client (React+Vite+TS)  ── HTTP / Realtime ──►  Fastify Backend
                                                     ├─ Auth · Profile · Interview · Curriculum · Skills
                                                     ├─ RecommendationService ─► RecommendationModel ─► Azure AI Foundry LLM
                                                     ├─ EvaluationService     ─► EvaluationModel     ─► Azure AI Foundry LLM
                                                     ├─ SkillUpdateService
                                                     └─ CurriculumService + background job runner
                                                              ▼
                                                          PostgreSQL  (domain state is ALWAYS persisted here)

Azure Voice Live (realtime interviewer) ── tool calls ─► Backend tools ─► PostgreSQL
```

**Invariant:** LLM recommends/evaluates → Backend validates/decides/persists →
Voice Live conducts → Web client presents.

**New HLD principle (add in Phase 1):**
> **The LLM is not the system of record.** The LLM may reason, evaluate, explain,
> and propose recommendations. The backend validates those outputs and owns all
> persistent user state, curriculum state, mastery state, interview state,
> scores, and progression.

**Two LLM surfaces, never coupled:** realtime (Azure Voice Live
`gpt-realtime-mini`) vs server-side reasoning (separate Azure AI Foundry text
deployment behind `RecommendationModel`/`EvaluationModel`).

---

## Architectural constraints (binding)

1. Backend owns application truth.
2. PostgreSQL owns persistent state.
3. Azure Voice Live conducts the realtime interview.
4. Backend calls an LLM for recommendation.
5. Backend calls an LLM for post-interview evaluation.
6. Recommendation is **synchronous**.
7. Evaluation is **asynchronous** (interview completes immediately; background job).
8. LLM produces recommendations/evaluations/proposals.
9. Backend validates and persists them.
10. No separate `interview-agent` service for v1.
11. Evaluation uses a background-job abstraction inside the backend initially.
12. The worker can be separated later if scale requires (no domain change).
13. DSA is the only implemented interview type for v1.
14. Generic domain entities remain extensible to future interview types.
15. Do not rewrite working MVP Azure Voice Live functionality unless required.
16. The browser is never authoritative for profile/interview/evaluation/skill/
    recommendation/curriculum state.

---

## Locked decisions

1. **LLM deployment** — separate server-side Azure AI Foundry model deployment
   for recommendation/evaluation, behind a backend LLM abstraction; provider/
   model configurable. Production auth: Managed Identity / Entra ID; local dev
   may use an API key. The Foundry credential is never exposed to the browser.
2. **Evaluation dimensions (DSA v1, canonical snake_case keys, 7):**
   `problem_understanding`, `approach`, `communication`, `coding`,
   `testing_debugging`, `complexity_analysis`, `independence`
   (`edge_cases → testing_debugging`). Each dimension returns a score +
   evidence + feedback. Scoring mechanics stay encapsulated in the evaluation
   domain.
3. **overallScore / recommendation** — backend-derived from the structured LLM
   evaluation (not an arbitrary LLM overall score). The LLM may propose the next
   topic/problem; the backend validates existence + appropriateness.
4. **topicMastery** — per curriculum topic. `UserSkillState`: `userId`,
   `curriculumId`, `topicId`, `masteryLevel`, `successfulAttempts`,
   `totalAttempts`, `lastAttemptAt`, `lastOutcome`, `strengths`, `weaknesses`.
   Scale: `not_started → learning → developing → proficient → mastered`. A single
   success never masters a topic. **Configurable thresholds** (documented
   defaults): 2 successes → developing, 3 → proficient, 3 → strong/mastered. A
   "successful attempt" is determined by the LLM evaluation, not merely the final
   answer.
5. **recommendationType** ∈ `{new_topic, continue_topic, reinforce_weakness,
   review_topic, advance_topic}`. The LLM recommends topic + problem **only from
   a backend-provided catalog/candidate set**; the backend validates. LLM output
   shape: `{recommendationType, topicId, problemId, reason}`.
6. **Transcript capture** — backend is canonical. Do not rely on a model tool.
   With the browser connecting directly to Voice Live, the **browser forwards**
   the relevant transcript/session events to the backend, which validates and
   persists them. Structured transcript only; **no raw audio by default**;
   retention configurable.
7. **Guests** — no anonymous learning loop for v1. Authentication is required;
   guests see only the landing/sign-in experience.
8. **Onboarding** — required on first sign-in, editable later. Taxonomy is
   domain configuration (not scattered in UI):
   - Interview types: `dsa` (v1); extensible to System Design, Behavioral, AI/ML.
   - Roles: Frontend Engineer, Backend Engineer, Full Stack Engineer, Mobile
     Engineer, Data Scientist, ML Engineer, DevOps/SRE, Data Engineer, Software
     Engineer, Other.
   - Levels: Entry, Junior, Mid, Senior, Staff, Principal.
9. **Tool naming** — canonical production realtime contract:
   `get_current_interview` (state + configuration), `get_current_problem`,
   `submit_interview_data`, `end_interview`. New code/docs use only these;
   existing names remain **deprecated aliases** temporarily (CLI-harness
   compatibility). Recommendation/evaluation are **backend operations, never
   realtime tools**.
10. **Trajectory** — simple: topic mastery over time, successful vs unsuccessful
    attempts, curriculum progression, recurring weaknesses, recommendation →
    outcome, improvement between attempts. No complex trajectory score.
    Transcript retention configurable; PII kept out of diagnostic logs.

---

## The learning loop (must be explicit in the domain)

```
UserProfile ─► Curriculum + UserSkillState ─► RecommendationService ─► persist Recommendation
  ─► Dashboard ─► Lobby ─► Voice Live Interview ─► transcript + code + approach persisted
  ─► EvaluationService (async job) ─► persist Evaluation ─► SkillUpdateService
  ─► update UserSkillState + UserCurriculumProgress ─► next Recommendation ─► next Interview
```

Normal coaching flow: the user chooses the **goal/type**; the system chooses the
**practice**. Progression emerges from curriculum + skill state + LLM
recommendation (e.g., Arrays/Easy → Hash Map/Easy-Medium → Two Sum variant/Medium).
Once an evaluation is accepted and persisted, state updates are a pure function
of persisted state (no further LLM call) → deterministic loop.

---

## Dependency graph

```
1 ─┬─► 2 ─► 3 ─► 4 ─► 5
   │        │     └──► 6 ─► 7 ─► 8 ─┐
   │        └──────────────────────┴─► 9 ─► 10 ─► 11 ─► 12
   └────────────────────────────────────────────────► 13, 14, 15 ─► 16
```
Notes: **5** needs **9**'s `GET /api/interviews` for recent interviews (ship the
rest first). **6** needs **4** + Phase 9's interview-from-recommendation binding.
**10** needs **9** (transcript/code). **12** needs **4/10/11**. **16** depends on all.

---

## Micro-items (resolved 2026-09-14)

1. **Tool surface scope** — accepted: the realtime surface is exactly
   `get_current_interview` (interview + configuration + candidate context),
   `get_current_problem`, `submit_interview_data` (candidate answers/notes + code
   submissions), `end_interview`. Hints are model-driven conversation (no
   `get_problem_hint` tool); code execution stays the client HTTP path
   (`POST /submissions/:id/runs`); `get_candidate_performance` /
   `get_interview_configuration` fold into `get_current_interview`. Old names are
   deprecated aliases only.
2. **Mastery level naming** — accepted scale: `not_started → learning →
   developing → proficient → mastered`; thresholds `not_started→learning` 1,
   `learning→developing` 2, `developing→proficient` 3, `proficient→mastered` 3
   (configurable policy; "beginner" ≈ `learning`, "strong" ≈ `mastered`).

---

# Phase 1 — Architecture principles & boundaries

- **Objective:** Freeze the new architecture in the docs; one source of truth.
- **Why:** The frozen rule requires an ADR + HLD amendment; prevents drift.
- **Dependencies:** none.
- **Inspect/reuse:** HLD §4/§5/§6/§7/§9/§10/§11/§14/§15/§16;
  `docs/architecture-frozen.md`; `docs/interview-coach-product-decisions.md` §17;
  `docs/adr-001-user-auth.md`.
- **Backend/Frontend/DB:** none (docs-only).
- **LLM:** document the two-surface rule + provider-agnostic interfaces.
- **Voice Live:** restate boundary (conducts only; no persistent state).
- **API:** none.
- **Tests:** lightweight doc-integrity check (e.g., frozen references ADR-002).
- **Acceptance:** HLD, frozen, ADR-002, product decisions aligned with no contradictions.
- **Risks:** scope creep; contradicting §17 open decisions.
- **Not included:** any code/DB/LLM.
- **Sub-phases:** 1.1 HLD amendments · 1.2 `architecture-frozen.md` · 1.3 ADR-002 ·
  1.4 product-decisions updates · 1.5 contradiction sweep.

# Phase 2 — User profile / onboarding

- **Objective:** `UserProfile` entity + first-run onboarding + profile APIs.
- **Why:** Starting context for recommendation and evaluation.
- **Dependencies:** 1.
- **Inspect/reuse:** `packages/domain/src/user.ts` (User/UserAccount/UserSession),
  `packages/backend/src/users.ts`, `packages/backend/src/auth.ts` (caller/ownership),
  `packages/db/src/schema.ts` (users), `App.tsx` entry, `ProfileScreen`,
  `SignInScreen`/`CreateAccountScreen`.
- **Backend:** `UserProfile` (interviewTypes[], role, level, goals?) + validation;
  `ProfileService`; `UserProfileRepository` (in-memory + Drizzle); `GET/PUT /api/profile`
  scoped to `caller.userId`; serializer; metric/event `profile.updated`.
- **Frontend:** `OnboardingScreen`; first-run gate (authenticated user with no profile →
  onboarding); profile edit; API client methods; server-state only. Remove the guest
  path from the loop (landing/sign-in only).
- **DB:** `user_profiles` table + migration `0004` (partial) + CHECK constraints.
- **LLM/Voice:** none.
- **API:** `GET /api/profile`, `PUT /api/profile`.
- **Tests:** domain validation/taxonomy; route ownership + PUT; onboarding-gate render smoke.
- **Acceptance:** new user completes onboarding; profile persisted + editable; readable
  by recommendation/evaluation.
- **Risks:** guest handling; taxonomy extensibility.
- **Not included:** curriculum/skills/recommendation.
- **Sub-phases:** 2.1 domain · 2.2 db+repo · 2.3 service+API · 2.4 client API ·
  2.5 onboarding UI+gate · 2.6 tests.

# Phase 3 — Curriculum & skill state

- **Objective:** Server-owned curriculum + per-user `UserSkillState`/`UserCurriculumProgress`.
- **Why:** Recommendation must not depend on browser-local curriculum; mastery is
  per-user persisted.
- **Dependencies:** 1, 2.
- **Inspect/reuse:** `dsa-interview-curriculum.json`; `packages/domain/src/catalog.ts`
  (`problemIdForTitle`); `packages/domain/src/selection.ts` (ordering/fallback);
  `packages/db/src/seed.ts`; `packages/db/src/schema.ts` (problems).
- **Backend:** Curriculum/Module/Topic entities + JSON import; `CurriculumService`;
  `UserSkillState` + `UserCurriculumProgress` entities/repos/services; APIs.
- **Frontend:** remove client `curriculum.ts`; Progress reads server (full view in Phase 13).
- **DB:** `curricula`, `curriculum_modules`, `curriculum_topics`,
  `curriculum_topic_problems`, `user_skill_states` (unique
  `(user_id, interview_type, topic_id)`), `user_curriculum_progress`;
  `problems.topic_id`; migration.
- **LLM:** none (mastery is LLM-proposed in Phase 10/11).
- **API:** `GET /api/curriculum`, `GET /api/curriculum/topics/:id`, `GET /api/skills`.
- **Tests:** import integrity, `problem_titles`→seeded IDs, ordering, 300-problem
  coverage, skill repo, restart survival.
- **Acceptance:** curriculum queryable server-side; skill state persisted per user/topic.
- **Risks:** title→ID mismatches; missing problem content.
- **Not included:** recommendation logic; mastery algorithm.
- **Sub-phases:** 3.1 curriculum domain+import · 3.2 db+migration · 3.3 repos ·
  3.4 skill domain+service · 3.5 APIs · 3.6 frontend cleanup · 3.7 tests.

# Phase 4 — LLM recommendation service

- **Objective:** `RecommendationService` + LLM provider + validation + persistence + API.
- **Why:** The product loop starts with a recommendation; LLM is advisory, backend owns truth.
- **Dependencies:** 1, 2, 3.
- **Inspect/reuse:** `selection.ts` (fallback/candidate generator),
  `app.ts` `/problems/select` route, client `nextPractice` (to retire).
- **Backend:** `Recommendation` entity + repo; `RecommendationModel` port;
  `AzureFoundryRecommendationModel`; deterministic fallback/candidate set;
  `RecommendationService`; validation; config `LLM_*`; metrics/events.
- **Frontend:** API client methods (consumed by Phase 5/6).
- **DB:** `recommendations` table (migration).
- **LLM:** provider abstraction, prompt, structured JSON output, timeout/retry.
- **API:** `GET /api/recommendations/current`, `POST /api/recommendations`,
  `POST /api/recommendations/:id/accept`.
- **Tests:** validation rules; deterministic fallback; provider adapter with fake HTTP;
  persistence.
- **Acceptance:** deterministic + LLM recommendation validated/persisted; fallback always
  yields a result.
- **Risks:** invalid LLM output; cost/latency; candidate-set design.
- **Not included:** dashboard/lobby UI.
- **Sub-phases:** 4.1 domain contract · 4.2 provider abstraction · 4.3 prompt/structured
  output · 4.4 validation · 4.5 persistence · 4.6 API · 4.7 tests · 4.8 deterministic fallback.

# Phase 5 — Dashboard

- **Objective:** Learning control center: goal + progress + recommended next +
  strengths/weaknesses.
- **Why:** Primary action is "recommended practice → start", not a problem browser.
- **Dependencies:** 2, 3, 4 (+ 9 for the recent-interviews list).
- **Inspect/reuse:** `DashboardScreen.tsx`, `App.tsx` wiring, `history.ts`/`progress.ts`
  (to retire).
- **Backend:** minimal (consumes Phase 2/3/4/9 APIs).
- **Frontend:** rewrite Dashboard (preparing-for header, recommendation card = primary CTA,
  curriculum progress, strengths/weaknesses, recent interviews); `useDashboard` hook;
  remove localStorage authority.
- **DB/LLM/Voice:** none new (consumes recommendation).
- **API:** consumes profile/recommendation/skills/interviews.
- **Tests:** render smoke; data mapping.
- **Acceptance:** dashboard shows server state; Start creates an interview from the
  recommendation.
- **Risks:** dependency on Phase 9 for history; guest state.
- **Not included:** deep History/Progress views (Phase 13).
- **Sub-phases:** 5.1 data hook · 5.2 recommendation card · 5.3 preparing-for + progress ·
  5.4 recent interviews · 5.5 remove local authority · 5.6 tests.

# Phase 6 — Lobby

- **Objective:** Final pre-interview step: recommendation + mic + session prep; no manual
  selection.
- **Why:** User chooses to practice, not design the curriculum.
- **Dependencies:** 4, 2 (+ Phase 9 interview-from-recommendation).
- **Inspect/reuse:** `BriefingScreen.tsx` (mic check), `SetupScreen.tsx` (to retire),
  `App.tsx` flow.
- **Backend:** create-from-recommendation binding (shared with Phase 9); otherwise reads.
- **Frontend:** Lobby layout (type/topic/problem/difficulty/objective), mic check, session
  prep, Start gating; retire Setup (or "Change goal" → profile).
- **DB:** `interviews.recommendation_id`/`topic_id` (Phase 9).
- **LLM:** none.
- **Voice Live:** prepare session (pre-mint **or** readiness check).
- **API:** `POST /api/interviews` (from recommendation).
- **Tests:** lobby render; gating logic.
- **Acceptance:** Start enabled only when mic + session ready; no topic/difficulty/problem
  selection.
- **Risks:** voice unconfigured (audit F8-3) blocks Start; guests.
- **Not included:** room changes (Phase 7).
- **Sub-phases:** 6.1 lobby layout · 6.2 recommendation display · 6.3 mic + session prep ·
  6.4 retire Setup · 6.5 tests.

# Phase 7 — Interview room + Azure Voice Live

- **Objective:** Realtime room with injected profile/problem/context; preserve validated
  Voice Live behavior.
- **Why:** The AI must speak first and adapt to the user/topic without owning learning logic.
- **Dependencies:** 6, 2, 3, 4.
- **Inspect/reuse:** `packages/backend/src/voice-session.ts` (`buildSessionInstructions`,
  `FROZEN_VOICE_SESSION_CONFIG`), mint route in `app.ts`,
  `packages/web-client/src/voice/voice-client.ts`, `voice/session.ts`, `LiveScreen`,
  `CodeWorkspace`, `ProblemPanel`.
- **Backend:** extend `SessionInstructionContext` + `buildSessionInstructions`
  (profile/topic/objective/skill + opening behavior); mint route loads context.
- **Frontend:** LiveScreen consumes the recommendation-driven problem (already voice-only);
  forward transcript events to the backend.
- **DB:** none (persistence in Phase 9).
- **LLM:** realtime model only (no server LLM).
- **Voice Live:** instruction injection; **frozen config + client loop unchanged**.
- **API:** mint payload extended.
- **Tests:** instruction-builder unit; existing `voice-client.test.ts` unchanged.
- **Acceptance:** AI speaks first, explains the problem, uses context; frozen config intact.
- **Risks:** missing problem content; instruction bloat.
- **Not included:** evaluation (Phase 10); tool-set changes (Phase 8).
- **Sub-phases:** 7.1 context assembly · 7.2 instruction builder · 7.3 mint route ·
  7.4 room wiring · 7.5 tests.

# Phase 8 — Backend tool architecture

- **Objective:** Small, explicit canonical tool set; centralized `call_id` dedup.
- **Why:** The model must never get generic DB access; duplicates must execute once.
- **Dependencies:** 7, 9.
- **Inspect/reuse:** `packages/domain/src/tool-service.ts`, `app.ts` tool-exec route,
  `packages/backend/src/idempotency.ts`, web `session.ts`/`voice-client.ts`.
- **Backend:** canonical tools `get_current_interview`, `get_current_problem`,
  `submit_interview_data`, `end_interview`; deprecated aliases for CLI compatibility;
  per-interview authz; keep centralized idempotency. Recommendation/evaluation are
  **not** tools.
- **Frontend:** update `REALTIME_TOOL_DEFINITIONS` + `VALID_TOOL_NAMES`.
- **DB:** `submit_interview_data` writes responses/submissions (existing) / messages (Phase 9).
- **LLM/Voice:** tool definitions for the realtime model.
- **API:** tool-exec unchanged; names/aliases.
- **Tests:** idempotency extension; new handlers; alias compatibility; authz.
- **Acceptance:** dedup enforced; tools authorized; no generic DB.
- **Risks:** CLI-harness compatibility.
- **Not included:** evaluation tools.
- **Sub-phases:** 8.1 tool-set mapping · 8.2 handlers · 8.3 aliases · 8.4 web definitions ·
  8.5 dedup/authz tests.

# Phase 9 — Interview persistence

- **Objective:** Complete server-backed persistence incl. transcript + history listing +
  recommendation linkage.
- **Why:** Browser must not be authoritative; users must return and see past interviews.
- **Dependencies:** 6, 7, 8.
- **Inspect/reuse:** `packages/db/src/schema.ts`, `packages/db/src/repositories.ts`,
  `packages/domain/src/interview-service.ts`, `packages/backend/src/serializers.ts`,
  `history.ts` (retire).
- **Backend:** `InterviewMessage` entity/repo/service + transcript append;
  `interviews.recommendation_id`/`topic_id`/`evaluation_status`;
  `InterviewRepository.listByCandidate`; serializers.
- **Frontend:** client methods; remove localStorage authority (consumed by 5/13).
- **DB:** `interview_messages` + alters; migration.
- **LLM/Voice:** none.
- **API:** `GET /api/interviews`, `POST /api/interviews/:id/transcript`, extended create.
- **Tests:** live-DB persistence + restart; message ordering; cascade.
- **Acceptance:** leave browser → return → see history; transcript persisted; recommendation
  context on the interview.
- **Risks:** transcript capture mechanism; PII.
- **Not included:** evaluation (Phase 10).
- **Sub-phases:** 9.1 transcript domain/db · 9.2 transcript service+API · 9.3 interview
  linkage · 9.4 history list API · 9.5 client · 9.6 tests.

# Phase 10 — LLM evaluation service

- **Objective:** Async LLM evaluation producing a validated structured evaluation.
- **Why:** The coach must judge transcript/code/approach and feed the learning state.
- **Dependencies:** 9, 4, 3.
- **Inspect/reuse:** `packages/domain/src/evaluation.ts`, `evaluation-pipeline.ts`
  (retain for derivation), `app.ts` evaluation route, `EvaluationForm`/`ResultsScreen`.
- **Backend:** `EvaluationService` + `EvaluationModel` port + `AzureFoundryEvaluationModel`;
  input assembly (transcript/code/approach/problem/topic/skill); validation; **async job**
  (`evaluation_jobs` + runner); enqueue on `end`; status API; remove manual path.
- **Frontend:** Results shows "Evaluation in progress" → result; remove `EvaluationForm`.
- **DB:** `evaluation_jobs`; `evaluations.topic_id/status/source/job_id`;
  `interviews.evaluation_status`.
- **LLM:** provider, prompt, structured output (7 canonical dimensions + evidence +
  feedback), timeout/retry.
- **Voice:** none.
- **API:** `GET /api/interviews/:id/evaluation`; `end` enqueues.
- **Tests:** validation; job runner (claim/retry/idempotency); provider fake; persistence;
  interview-not-lost on failure; synchronous runner for tests.
- **Acceptance:** `end` → completed immediately → job → evaluation persisted + validated.
- **Risks:** LLM quality; job durability.
- **Not included:** skill update (Phase 11).
- **Sub-phases:** 10.1 domain contract · 10.2 provider · 10.3 prompt/structured output ·
  10.4 input assembly · 10.5 validation · 10.6 job runner · 10.7 persistence+API ·
  10.8 frontend · 10.9 tests.

# Phase 11 — Skill/curriculum update

- **Objective:** Apply an accepted evaluation to `UserSkillState` + curriculum progress
  deterministically.
- **Why:** The learning loop must be deterministic from persisted state once accepted.
- **Dependencies:** 10, 3.
- **Inspect/reuse:** `evaluation-pipeline.ts` (retain primitives), no existing skill logic.
- **Backend:** `SkillUpdateService` (pure) + configurable decision rules
  (`continue|revisit|advance`); update skill state + curriculum pointer; persist.
- **Frontend/DB/LLM/Voice:** none new (uses Phase 3 tables; consumes the LLM proposal).
- **API:** internal (invoked by the job).
- **Tests:** pure rule tests; determinism; idempotency; configurable thresholds.
- **Acceptance:** evaluation → skill/curriculum updated via validated rules.
- **Risks:** threshold tuning; proposal validation.
- **Not included:** recommendation regeneration (Phase 12).
- **Sub-phases:** 11.1 rules · 11.2 skill update · 11.3 curriculum progression ·
  11.4 persistence · 11.5 tests.

# Phase 12 — Adaptive learning loop

- **Objective:** Close the loop: evaluation → skill update → **new recommendation**.
- **Why:** Progressive adaptation is the core product value.
- **Dependencies:** 4, 10, 11.
- **Inspect/reuse:** RecommendationService, EvaluationService, SkillUpdateService.
- **Backend:** invalidate/supersede the current recommendation after a skill update;
  regenerate; loop metrics/events.
- **Frontend:** Dashboard/Lobby reflect the new recommendation (Phase 5/6).
- **DB:** `recommendations.status` transitions.
- **LLM:** recommendation call after update.
- **API:** none new.
- **Tests:** loop test (fake models); supersession; no oscillation.
- **Acceptance:** a completed interview yields an updated recommendation.
- **Risks:** loops/oscillation; cost.
- **Not included:** analytics.
- **Sub-phases:** 12.1 invalidation · 12.2 regeneration trigger · 12.3 supersession ·
  12.4 loop tests.

# Phase 13 — History & progress

- **Objective:** Server-backed history + progress answering "practiced / good at /
  improve / next".
- **Why:** Remove browser authority; keep it simple (no analytics engine).
- **Dependencies:** 9, 3, 11, 4.
- **Inspect/reuse:** `HistoryScreen`, `ProgressScreen`, `WeakAreasScreen`,
  `history.ts`/`progress.ts` (retire).
- **Backend:** reuse list/skills/recommendation APIs (optional aggregate endpoint).
- **Frontend:** History (server rows, pagination, evaluation-status badge, optional delete);
  Progress (topics practiced, mastery, curriculum progress, strengths/weaknesses, minimal
  trajectory, current recommendation); WeakAreas from server skills; remove localStorage.
- **DB/LLM/Voice:** none new.
- **API:** consumes existing.
- **Tests:** mapping; render smoke.
- **Acceptance:** the four questions answered from server state.
- **Risks:** trajectory metric choice.
- **Not included:** elaborate analytics.
- **Sub-phases:** 13.1 history · 13.2 progress · 13.3 weak areas · 13.4 remove local ·
  13.5 tests.

# Phase 14 — Security, observability & failure handling *(deferred to v2)*

- **Objective:** Production reliability across all new surfaces.
- **Dependencies:** 2–13.
- **Inspect/reuse:** `packages/backend/src/auth.ts`, `users.ts`, `idempotency.ts`,
  `voice-session.ts`, `code-runner.ts`, `metrics.ts`, `prometheus.ts`, `rate-limit.ts`,
  `docs/deployment.md`.
- **Backend:** ownership for profile/skills/recommendations; LLM creds server-side
  (Managed Identity prod / key local-dev); new-tool authz; LLM timeout/retry/output
  validation; recommendation fallback; durable evaluation jobs; metrics/events for
  recommendation/evaluation/jobs/LLM; correlation ids; PII-safe logging.
- **Frontend:** no authoritative localStorage; error states; `evaluation_in_progress`.
- **DB:** none new (job status reuse).
- **LLM:** failure handling policy.
- **Voice Live:** credential boundary unchanged.
- **API:** rate budgets for new routes.
- **Tests:** authz; failure injection; metrics/events.
- **Acceptance:** the reliability requirements met; tracing spans present
  (recommendation/evaluation/realtime).
- **Risks:** tracing tech choice; retry policy.
- **Not included:** new features.
- **Sub-phases:** 14.1 authz · 14.2 LLM creds/validation · 14.3 failure handling ·
  14.4 metrics/events/tracing · 14.5 tests.

# Phase 15 — Testing strategy *(deferred to v2)*

- **Objective:** Consolidated suite per the agreed strategy (domain-first).
- **Dependencies:** 2–14.
- **Inspect/reuse:** existing tests + `helpers.ts` harnesses.
- **Work:** new domain tests (profile, curriculum, recommendation, evaluation-service,
  skill-update); backend route tests (profile/recommendations/skills/interviews-list/
  evaluation-job); fixtures + fakes (`FakeRecommendationModel`, `FakeEvaluationModel`,
  fake job runner); extend live-DB tests; keep `voice-client.test.ts`; Azure = manual.
- **DB:** extend `persistence.test.ts` for new tables/migrations.
- **LLM:** deterministic fixtures; no live LLM in unit tests.
- **Voice:** unchanged automated coverage; live manual.
- **API:** route tests.
- **Acceptance:** suite green; the 10 areas covered; no live LLM dependency.
- **Risks:** flakiness; coverage.
- **Not included:** UI E2E (unless requested).
- **Sub-phases:** 15.1 fixtures/doubles · 15.2 domain tests · 15.3 backend route tests ·
  15.4 db live tests · 15.5 integration loop · 15.6 CI gate.

# Phase 16 — Final integration / production readiness *(deferred to v2)*

- **Objective:** Integrate and validate Phases 1–15 end-to-end. **No new product
  functionality.**
- **Dependencies:** all.
- **Work:** run all migrations on a `*_test` DB; seed catalog + curriculum; integration
  test of the **complete loop**; compose boot probe (db+backend+web); bundle secret scans;
  deployment/monitoring finalization; one **manual** Azure Voice Live smoke; release
  checklist.
- **DB:** migration apply + restart-survival across all tables.
- **LLM:** fakes for CI + one optional live smoke.
- **Voice Live:** manual validation only.
- **API:** none new.
- **Tests:** E2E loop test; compose probe; metrics scrape.
- **Acceptance:** the full loop works:
  `Onboarding → UserProfile → Curriculum + UserSkillState → Recommendation → persist →
  Dashboard → Lobby → Voice Live Interview → Interview Persistence → Async Evaluation →
  persist → Update UserSkillState → Update Curriculum Progress → New Recommendation →
  History/Progress`.
- **Risks:** Azure credential (audit F8-3); missing problem content; CLI compatibility.
- **Not included:** any new product functionality.

---

## Cross-references

- Product vision + architecture parts: `docs/SESSION_HANDOFF.md` ("Learning-loop
  architecture").
- Current architecture baseline: `interview-coach-hld-and-implementation-plan.md`,
  `docs/architecture-frozen.md`.
- Product decisions (resolved): `docs/interview-coach-product-decisions.md` §17.
- Build-phase audit (pre-learning-loop): `docs/audit/`.
- Deployment/ops: `docs/deployment.md`.
