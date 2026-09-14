# ADR-002 — Backend-owned recommendation & evaluation via a server-side LLM

Status: accepted (2026-09-14). Amends the frozen planes (`docs/architecture-frozen.md`
§2/§8) and the HLD; supersedes the HLD's placement of deep post-interview work in a
planned `interview-agent` service. Governs the personalized learning loop.

## Context

The product is a learning/coaching tool, not an interview simulator: the user
chooses the interview **goal/type**, and Interview Coach decides **what to
practice**, adapting over time from profile, curriculum, skill state, and prior
evaluations. The MVP proved Azure Voice Live can hold the realtime interview and
call backend tools, and that backend state must remain authoritative. The prior
HLD described a single realtime model plus a planned `interview-agent` for
background work; it had no profile, curriculum, skill-state, recommendation, or
LLM-backed evaluation. This ADR records the approved target architecture.

## Decisions

1. **Two LLM surfaces, never coupled.**
   - **Realtime:** Azure Voice Live (`gpt-realtime-mini`) conducts the interview.
   - **Server-side reasoning:** a **separate Azure AI Foundry text deployment**
     (recommendation + evaluation) behind `RecommendationModel` / `EvaluationModel`
     interfaces. Provider/model configurable; production auth via Managed
     Identity/Entra ID, local dev may use an API key. The Foundry credential is
     **never** exposed to the browser. Recommendation/evaluation are **not**
     realtime tools.
2. **Backend owns truth; the LLM is not the system of record.** The LLM may
   reason, evaluate, explain, and propose; the backend validates every output and
   owns all persistent user/curriculum/mastery/interview/score/progression state.
3. **Recommendation is synchronous**; **evaluation is asynchronous**. Interview
   completion persists data and returns immediately; evaluation runs as a
   background job (`evaluation_in_progress` surfaced to the UI). Keep the job
   runner abstraction so it can execute synchronously in tests and become a
   separate worker later **without domain changes**.
4. **No `interview-agent` service for v1.** Its intended responsibilities are
   absorbed into backend application services: `RecommendationService`,
   `EvaluationService`, `SkillUpdateService`, `CurriculumService`, plus an
   in-process background job runner.
5. **Evaluation dimensions (DSA v1, canonical snake_case):**
   `problem_understanding`, `approach`, `communication`, `coding`,
   `testing_debugging`, `complexity_analysis`, `independence`
   (`edge_cases → testing_debugging`). Each returns a score + evidence + feedback;
   scoring mechanics stay encapsulated in the evaluation domain.
6. **Backend derives `overallScore` / success / mastery / progression** from the
   structured evaluation (no arbitrary LLM overall score). The LLM may propose the
   next topic/problem; the backend validates it against the curriculum and the
   user's state.
7. **Per-topic mastery** (`UserSkillState`): `not_started → learning → developing
   → proficient → mastered`, with **configurable thresholds** (documented
   defaults: `not_started→learning` 1, `learning→developing` 2,
   `developing→proficient` 3, `proficient→mastered` 3). A single success never
   masters a topic; a "successful attempt" is decided by the LLM evaluation.
8. **`recommendationType`** ∈ `{new_topic, continue_topic, reinforce_weakness,
   review_topic, advance_topic}`; the LLM recommends topic + problem **only from a
   backend-provided candidate set**.
9. **Transcript is backend-canonical.** The browser forwards realtime transcript
   events to the backend (the browser connects directly to Voice Live); the
   backend validates and persists them. No model tool dependency; structured
   transcript only, **no raw audio** by default; retention configurable.
10. **No anonymous learning loop for v1.** Authentication is required; guests see
    only the landing/sign-in experience. Onboarding is required on first sign-in
    and editable later; interview types / roles / levels are **domain
    configuration**, extensible (DSA only implemented for v1).
11. **Canonical realtime tool contract (small, explicit):** `get_current_interview`
    (state + configuration + candidate context), `get_current_problem`,
    `submit_interview_data`, `end_interview`. Existing names remain **deprecated
    aliases** temporarily (CLI-harness compatibility); they are not the production
    contract.
12. **Trajectory stays simple** (topic mastery over time, success vs attempts,
    curriculum progression, recurring weaknesses, recommendation → outcome,
    improvement between attempts). Transcript is PII; never log its contents.

## Consequences

- New backend domains/services: Profile, Curriculum, Skills, Recommendation,
  Evaluation, SkillUpdate, plus a background-job runner. New tables:
  `user_profiles`, `curricula`, `curriculum_modules`, `curriculum_topics`,
  `curriculum_topic_problems`, `user_skill_states`, `user_curriculum_progress`,
  `recommendations`, `interview_messages`, `evaluation_jobs` (+ alters).
- New APIs: profile, curriculum, skills, recommendations, interview list,
  transcript, evaluation status.
- The frozen planes gain a **server-side LLM plane**; the realtime path stays
  minimal; the tool contract shrinks and remains `call_id`-idempotent.
- The HLD phased plan gains a **Phase 9 (Personalization & learning loop)**;
  the former Phase 9 (interview types) becomes Phase 10.
- Implementation is sequenced in `docs/implementation-roadmap.md` (Phases 1–16).
