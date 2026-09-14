# Interview Coach — High-Level Design & Phased Implementation Plan

**Status:** Post-MVP architecture baseline  
**Date:** 2026-09-11  
**Primary scope:** DSA interview first; productization of the validated realtime Voice Live MVP.

---

## 1. Executive Summary

The Interview Coach MVP has validated the core technical/product hypothesis:

> A realtime voice model can conduct a useful DSA interview while the application keeps authoritative interview state and deterministic operations outside the model.

The MVP currently uses:

- Node.js + TypeScript CLI
- Azure AI Voice Live
- `gpt-realtime-mini`
- realtime microphone input
- realtime PCM audio output
- server-side VAD
- server echo cancellation (Voice Live capability; harness leaves it disabled — raw mic)
- Azure deep noise suppression (Voice Live capability; harness leaves it disabled — raw mic)
- model tool calling
- deterministic interview tools
- in-memory interview state
- Linux `arecord` / `aplay`

The MVP intentionally excluded:

- production UI
- persistent database
- authentication
- production deployment
- generic agent framework
- speculative orchestration
- a required separate `InterviewAgent` in the realtime path

The next stage should therefore be **productization**, not more MVP experimentation.

### Core architectural principle

> **The model owns conversation and conversational decisions; the backend owns truth, persistence, business rules, authorization, and deterministic operations.**

---

# 2. What the MVP Proved

## 2.1 Realtime voice loop

Validated end-to-end:

```text
Microphone
   |
   v
arecord / PCM16 24 kHz mono
   |
   v
Node.js / TypeScript
   |
   v
Azure Voice Live
   |
   v
gpt-realtime-mini
   |
   +---- tool calls ----> application tools
   |
   v
Voice Live audio deltas
   |
   v
Node.js
   |
   v
aplay / speaker
```

## 2.2 Conversation

The model can:

- start the interview
- listen to the candidate
- respond naturally
- maintain conversational context
- ask questions
- call deterministic tools
- use tool results in subsequent reasoning
- continue without getting stuck

## 2.3 Tool calling

The MVP successfully used deterministic tools such as:

- `get_current_problem`
- `get_interview_state`
- `get_candidate_performance`

The important design decision is that these tools retrieve application-owned state rather than allowing the model to invent canonical state.

## 2.4 Barge-in

Barge-in is functionally working.

Current path:

```text
server VAD detects candidate speech
        |
        v
client receives speech_started
        |
        +--> response.cancel
        |
        +--> local playback flush
        |
        v
assistant response stops
```

The local playback flush was measured around 4–5 ms once the interruption event reached the client.

The remaining variability is primarily in when server-side VAD recognizes speech. That is a realtime UX tuning concern, not an MVP architecture blocker.

## 2.5 Conversation memory

The MVP demonstrated that the model remembered earlier parts of the interview.

This supports using the realtime model's conversation context rather than building a separate memory/orchestration system prematurely.

---

# 3. MVP Findings That Should Carry Forward

## 3.1 Backend state must remain authoritative

The model should not be trusted as the source of truth for:

- current problem
- interview status
- candidate identity
- scores
- completion state
- persisted results

Those belong to the application.

## 3.2 Model should control conversation

The MVP showed useful conversational autonomy.

The model should be able to decide:

- what to ask next
- when to probe
- when a tool is needed
- when to move the conversation forward

The backend should enforce application rules without micromanaging every conversational turn.

## 3.3 Tools are the model/application boundary

Use small domain tools rather than exposing arbitrary application/database access.

Good:

```text
get_current_problem()
get_interview_state()
end_interview()
```

Bad:

```text
query_database(sql)
```

## 3.4 Realtime event handling must be defensive

One model function call can appear through multiple Voice Live protocol events.

Tool execution therefore needs `call_id` deduplication.

This is a permanent reliability requirement.

## 3.5 Realtime audio is an end-to-end pipeline

Barge-in depends on:

```text
microphone
 -> capture
 -> network
 -> server VAD
 -> speech_started event
 -> response.cancel
 -> local playback flush
 -> speaker
```

The MVP demonstrated that the local cancellation/flush portion can be very fast once the event reaches the client.

---

# 4. High-Level Architecture

```text
                         ┌───────────────────────┐
                         │       Candidate       │
                         │                       │
                         │ Web / future clients  │
                         └───────────┬───────────┘
                                     │
                                     v
                    ┌────────────────────────────────┐
                    │        Interview Coach         │
                    │            Backend             │
                    │                                │
                    │ Auth                           │
                    │ Interview lifecycle            │
                    │ Session management              │
                    │ Interview state                 │
                    │ Problem repository              │
                    │ Evaluation                       │
                    │ Tool implementations             │
                    │ Persistence                      │
                    └───────────────┬────────────────┘
                                    │
                   ┌────────────────┼────────────────┐
                   │                │                │
                   v                v                v
             ┌──────────┐     ┌────────────┐   ┌─────────────┐
             │ Database │     │ Problems   │   │ Evaluation  │
             │          │     │ Repository │   │ / Results   │
             └──────────┘     └────────────┘   └─────────────┘

                                    │
                              tools / session
                                    │
                                    v
                    ┌────────────────────────────────┐
                    │       Azure Voice Live         │
                    │                                │
                    │ Realtime conversation           │
                    │ VAD / AEC / noise handling     │
                    │ Model tool calling              │
                    │ Audio                           │
                    └───────────────┬────────────────┘
                                    │
                                    v
                              Realtime model
```

The exact production transport between the client, backend, and Voice Live should be finalized during the production voice-session phase.

### Target architecture — personalized learning loop (ADR-002)

The MVP diagram above shows the realtime interview loop. The product target adds a
**second, server-side LLM surface** and backend learning domains. See
`docs/adr-002-recommendation-evaluation-llm.md` and
`docs/implementation-roadmap.md`.

```text
Web Client (React+Vite+TS)
  │ HTTP / Realtime
  ▼
Fastify Backend  ── Auth · Profile · Interview · Curriculum · Skills
  │   ├─ RecommendationService ─► RecommendationModel ─► Azure AI Foundry LLM
  │   ├─ EvaluationService     ─► EvaluationModel     ─► Azure AI Foundry LLM
  │   ├─ SkillUpdateService
  │   └─ CurriculumService + background job runner
  ▼
PostgreSQL   (domain state is ALWAYS persisted here)

Azure Voice Live (realtime interviewer) ── tool calls ─► Backend tools ─► PostgreSQL
```

- **Two LLM surfaces, never coupled.** Azure Voice Live (`gpt-realtime-mini`)
  conducts the realtime interview; a **separate** Azure AI Foundry text deployment
  powers recommendation and evaluation behind provider-agnostic interfaces. The
  Foundry credential is server-side only.
- **The LLM is not the system of record.** The LLM reasons/evaluates/proposes;
  the backend validates and owns all persistent state.
- Recommendation is **synchronous**; evaluation is **asynchronous** (background
  job; the interview completes immediately).

---

# 5. Component-by-Component Design

## 5.1 Client

### Current

Linux CLI.

Responsibilities:

- microphone capture
- realtime audio transmission
- speaker playback
- session display
- shutdown

Audio:

```text
Input:
PCM16 / 24,000 Hz / mono

Output:
PCM16 / 24,000 Hz / mono
```

### Future web client

Responsibilities:

- interview setup
- microphone permissions
- realtime conversation
- timer
- problem display
- coding editor
- interview status
- end-interview action
- results

The client must not own authoritative interview state.

---

## 5.2 Interview Backend

Existing architectural name:

`interview-coach`

Responsibilities:

- users
- **profile** (starting context: interview types, role, level, goals)
- interviews
- interview lifecycle
- session state
- **curriculum** (server-owned modules/topics/ordering/problem mapping)
- **skills** (per-user, per-topic `UserSkillState` + curriculum progress)
- **recommendation** (`RecommendationService` → `RecommendationModel` LLM)
- **evaluation** (`EvaluationService` → `EvaluationModel` LLM; async)
- **skill update** (`SkillUpdateService`: mastery + progression, deterministic)
- problem selection
- interview configuration
- tool implementations
- **background job execution** (in-process; extractable later)
- persistence
- authentication
- authorization
- APIs

This is the core application service. Recommendation and evaluation are
**backend application capabilities** that call a server-side LLM (ADR-002); there
is **no separate `interview-agent` service** for v1.

---

## 5.3 Interview Session

Represents one candidate's interview attempt.

Conceptual structure:

```text
Interview
├── id
├── candidate
├── type
├── status
├── startedAt
├── endedAt
├── configuration
├── currentProblem
├── realtime session metadata
└── evaluation
```

The model can maintain conversational context, but the backend remains authoritative for these fields.

---

## 5.4 Problem Repository

Canonical problems live in application-owned storage.

A DSA problem should eventually contain:

```text
id
title
difficulty
topic                 (curriculum topic it belongs to)
description
constraints
examples              (input/output/explanation)
sample test cases     (structured args/expected, for the room's Test button)
expected concepts
solution metadata
evaluation criteria
```

The model can retrieve the problem through a tool. The backend (not the model)
selects problems via the recommendation service (ADR-002).

---

## 5.5 Tool Layer

Canonical realtime tool contract (ADR-002; small and explicit):

```text
get_current_interview     (interview state + configuration + candidate context)
get_current_problem
submit_interview_data     (candidate answers/notes + code submissions)
end_interview
```

- Existing names (`get_interview_state`, `get_candidate_performance`,
  `get_interview_configuration`, `record_candidate_answer`, `submit_solution`,
  `get_problem_hint`, `run_code`) remain **deprecated aliases** temporarily for
  CLI-harness compatibility; they are not the production contract.
- **Recommendation and evaluation are NOT tools.** They are backend application
  services that call a server-side LLM (ADR-002). `evaluate_solution` is therefore
  implemented as the evaluation service, not a realtime tool.

Tool requirements:

- narrow domain scope
- authorization against current interview
- deterministic behavior where possible
- observable execution
- idempotency where practical
- `call_id` deduplication

---

## 5.6 Voice / Realtime Integration

Validated configuration:

```text
Endpoint:
https://interview-coach-voice.services.ai.azure.com

Model:
gpt-realtime-mini

API version:
2026-04-10

Voice:
{ type: "azure-standard", name: "en-US-Andrew:DragonHDLatestNeural" }
(the harness sends the voice as this { type, name } object)

Audio:
PCM16 / 24 kHz / mono
```

The production resource/configuration may differ by environment.

Responsibilities:

- establish realtime connection
- configure session
- send microphone audio
- receive audio deltas
- route model tool calls
- return tool results
- manage response lifecycle
- handle cancellation
- handle barge-in
- manage local playback

---

## 5.7 VAD / AEC / Audio

Validated MVP configuration:

```text
turn_detection:
  type = server_vad
  threshold = 0.35
  speech_duration_ms = 80
  silence_duration_ms = 500
  interrupt_response = true
  create_response = true
```

Echo/noise:

The following are Voice Live *capabilities* (session input options) that exist but
are **not** enabled by the CLI harness, which runs raw mic:

```text
server_echo_cancellation        (available, NOT enabled by harness)
azure_deep_noise_suppression    (available, NOT enabled by harness)
```

The validated MVP configuration therefore ran with **raw microphone input** —
no server echo cancellation, no server noise suppression (both fields are
commented out in the harness `voice-session.ts`). The web client (S4) adds echo
cancellation + noise suppression in its own WebAudio path instead.

### Important operational finding

Headphones significantly improve reliability because they prevent assistant audio from leaking into the microphone.

Speaker + microphone acoustic isolation is therefore an important test consideration.

---

## 5.8 Evaluation Service

Evaluation is a first-class backend component (`EvaluationService`) that calls a
**server-side LLM** (`EvaluationModel`, ADR-002). It is **asynchronous**: the
interview completes immediately and a background job produces the evaluation.

Input (where available): transcript, candidate code/submissions + run verdicts,
stated approach/reasoning, problem definition, curriculum topic, and the user's
current `UserSkillState`.

Canonical dimensions (DSA v1, snake_case):

```text
problem_understanding
approach
communication
coding
testing_debugging
complexity_analysis
independence
```

Each dimension returns a score + evidence + feedback. The backend validates the
structured output and **derives** `overallScore`, success, mastery, and
progression (the LLM does not set the overall score). Hint usage is evidence
considered by the LLM (primarily via `independence`) — there is no deterministic
"≥3 hints" rule. Evaluation records are persisted separately from the live
conversation and feed `SkillUpdateService`.

---

## 5.9 Interview State Machine

Recommended application lifecycle:

```text
CREATED
   |
   v
READY
   |
   v
IN_PROGRESS
   |
   +------> PAUSED
   |          |
   |          v
   |       IN_PROGRESS
   |
   v
COMPLETING
   |
   v
COMPLETED
```

Also define:

```text
CANCELLED
FAILED
```

The model can conversationally decide that the candidate is done, but the application performs the actual lifecycle transition.

---

## 5.10 Authentication / Authorization

Authentication belongs at the backend boundary.

Important rule:

```text
Browser/client
    X privileged Azure credentials

Backend
    -> Azure Voice Live
```

Azure credentials remain server-side.

A controlled API-key mode was used/considered for local development testing. Production should use the appropriate Azure identity/authentication mechanism.

---

## 5.11 Persistence

The MVP used in-memory state. **PostgreSQL is the persistent source of truth**
(S2 chose Postgres 16 + Drizzle; S8b deployed it).

Production persistence covers:

- users, sessions, **profile**
- **curriculum** (modules/topics/topic→problem)
- **skills** (`UserSkillState`, curriculum progress)
- **recommendations**
- interviews, **interview messages (transcript)**
- problems
- interview events
- candidate responses
- submissions + runs
- evaluation
- **evaluation jobs**
- scores
- configuration
- lifecycle state
- timestamps

Domain state is **always** persisted by the backend; the browser is never
authoritative (ADR-002).

---

## 5.12 Observability

### Application events

```text
interview started
interview completed
tool invoked
tool failed
session disconnected
evaluation completed
```

### Realtime events

Useful lifecycle events:

```text
speech_started
speech_stopped
response_created
first_audio_delta
response_cancel
playback_flush
response_done
tool_started
tool_completed
```

Avoid per-PCM-chunk logging in normal operation.

Useful latency measurements:

```text
speech_stopped -> response_created
response_created -> first_audio_delta
speech_started -> response.cancel
speech_started -> playback flush
tool start -> tool complete
```

Add (ADR-002) structured spans:
- Recommendation: `requested → llm.called → llm.responded → validation → persisted`
- Evaluation: `interview.completed → job.started → llm.called → llm.responded → validation → persisted → skill.updated`
- Realtime: `session.created → connected → tool.call → tool.result → interview.completed`

---

## 5.13 Profile

Starting context for the learning loop, stored per user (not browser-local).

- Fields: `interviewTypes[]` (v1 `["dsa"]`), `role`, `level`, `goals?`.
- Taxonomy (interview types / roles / levels) is **domain configuration**,
  extensible; v1 implements DSA only.
- Required on first sign-in; editable later. Readable by recommendation and
  evaluation.

## 5.14 Curriculum

Application data (not frontend metadata). The existing
`dsa-interview-curriculum.json` is imported into the backend/domain/DB so
recommendation does not depend on browser-local curriculum data.

- Shape: `Curriculum → Module → Topic → Problem` (ordering + topic→problem links).
- The curriculum represents **what can be learned**; selection/recommendation is
  separate.

## 5.15 Skills

Per-user learning state. `UserSkillState` (per curriculum topic):

```text
userId, curriculumId, topicId
masteryLevel        not_started | learning | developing | proficient | mastered
successfulAttempts, totalAttempts
lastAttemptAt, lastOutcome
strengths, weaknesses
```

Plus `UserCurriculumProgress` (current module/topic pointer). Mastery is
**proposed by the LLM evaluation** and **applied by the backend** via configurable
thresholds (documented defaults: `not_started→learning` 1, `learning→developing`
2, `developing→proficient` 3, `proficient→mastered` 3). A single success never
masters a topic. The curriculum represents what can be learned; `UserSkillState`
represents where this user stands.

## 5.16 Recommendation Service

The central loop entry point. Reads profile + curriculum + `UserSkillState` +
recent outcomes, calls `RecommendationModel`, **validates** the proposal, and
persists a `Recommendation`.

- Structured output: `{ recommendationType, topicId, problemId, reason }` with
  `recommendationType ∈ {new_topic, continue_topic, reinforce_weakness,
  review_topic, advance_topic}`.
- The LLM chooses **only from a backend-provided candidate set**; the backend
  validates topic/problem existence, topic membership, interview-type
  compatibility, and appropriateness.
- **Synchronous**; has a **deterministic fallback** (curriculum order + skill
  state) so recommendation failure never blocks the product.

## 5.17 LLM Provider (server-side)

A provider-agnostic interface for the non-realtime LLM surface:

```text
RecommendationModel.propose(input) -> RecommendationProposal
EvaluationModel.evaluate(input)    -> EvaluationProposal
```

- Backed by a **separate Azure AI Foundry text deployment** (not the Voice Live
  model); provider/model configurable.
- Production auth: Managed Identity / Entra ID; local dev may use an API key.
  Credentials are server-side only and never reach the browser.
- Timeout + bounded retries; outputs are validated before persistence.

## 5.18 Background jobs

Evaluation runs off the request path. A `JobQueue`/runner abstraction (in-process
initially) claims and executes `evaluation` jobs; the interview completes
immediately and the UI shows `evaluation_in_progress`. The runner is
**extractable to a separate worker** later using the same table + domain
contracts, with no domain-model change.

---

# 6. Data Ownership

## Model-owned

- conversational wording
- conversational reasoning
- deciding what to ask
- deciding when to probe
- deciding when a tool is useful
- adapting to candidate responses

## Application-owned

- candidate identity, **profile**
- interview ID
- canonical problem
- **curriculum** (modules/topics/ordering)
- **skill state** (`UserSkillState`, curriculum progress)
- **recommendations**
- interview status
- **transcript (interview messages)**
- permissions
- score records
- evaluation records (and **evaluation jobs**)
- timestamps
- persistence
- tool authorization
- final interview state

This boundary prevents model hallucination from becoming application state. The
server-side LLM (`RecommendationModel`/`EvaluationModel`) is **advisory**: it
produces proposals that the backend validates and persists. The **LLM is not the
system of record** (ADR-002).

---

# 7. Technology Stack

## 7.1 Confirmed and working

| Area | Technology | Status |
|---|---|---|
| Language | TypeScript | Working |
| Runtime | Node.js | Working |
| Realtime voice | Azure AI Voice Live | Validated |
| Realtime model | `gpt-realtime-mini` | Validated |
| Audio capture | Linux `arecord` | Validated |
| Audio playback | Linux `aplay` | Validated |
| Audio | PCM16, 24 kHz, mono | Validated |
| VAD | Server VAD | Validated |
| Echo cancellation | Server echo cancellation | Available (harness disabled — raw mic) |
| Noise reduction | Azure deep noise suppression | Available (harness disabled — raw mic) |
| Tool calling | Voice Live model tools | Validated |
| Development | npm + tsx | Working |
| Development OS | Ubuntu/Linux | Working |
| Containers | Docker | Existing project direction |

---

## 7.2 Existing broader project architecture

| Component | Technology / name | Status |
|---|---|---|
| Product backend/frontend | `interview-coach` | Existing architecture |
| Persistent database | PostgreSQL 16 + Drizzle | Confirmed (S2/S8b) |
| Server-side LLM | Azure AI Foundry text deployment | Planned (ADR-002) |
| Background work | in-backend job runner | Planned (ADR-002; **no separate agent**) |
| Docker | Containerization | Existing direction |
| Authentication | Backend-controlled | Local accounts (S8c); prod identity S8d |
| Voice | Azure Voice Live | Validated |

There is **no separate `interview-agent` service** for v1: recommendation,
evaluation, skill update, and curriculum are backend application services with an
in-process background runner (ADR-002).

---

# 8. Known Working vs Problematic

## Working

### Azure Voice Live realtime conversation

End-to-end validated.

### `gpt-realtime-mini`

Successfully conducts the realtime interview.

### Server VAD

Successfully detects candidate turns.

### Server AEC + noise suppression

Available as Voice Live capabilities, but the CLI harness leaves them disabled
(raw mic), so they were **not** part of the validated MVP configuration. The web
client adds echo cancellation + noise suppression in its own WebAudio path.

### Headphones

Reliable setup for preventing assistant audio from being detected as candidate speech.

### Model tool calling

Validated.

### Tool result integration

Validated.

### Conversation context

Validated.

### Local playback cancellation

Validated and can be very fast after the interruption event arrives.

---

## Problematic / not production-proven

### Acoustic speaker + microphone setup

Assistant audio can enter the microphone and cause unwanted detection.

Headphones mitigate this.

### Barge-in latency

Barge-in works, but latency is variable because detection depends on the server-side VAD pipeline.

The local flush is not the primary bottleneck once `speech_started` reaches the client.

### Initial response latency

Some tests showed roughly 1.7 seconds from `response.created` to the first audio delta.

This should be measured and improved later, but did not block the MVP.

### Duplicate tool execution events

A single function call can surface through multiple Voice Live events.

The application must deduplicate using `call_id`.

### Excessive diagnostics

Per-audio-chunk logging is too noisy.

Normal operation should use lifecycle and timing logs.

---

# 9. What We Know Does NOT Need to Be Added Yet

The MVP does not justify immediately adding:

- a generic agent framework
- multiple cooperating agents
- a custom memory system
- a custom speech-to-text pipeline
- a custom text-to-speech pipeline
- a large orchestration state machine
- multiple interview types (v1 is DSA only)
- distributed infrastructure (the background job runner is in-process for v1)
- the `interview-agent` in the realtime voice loop

These can be introduced later when a concrete requirement justifies them.
**Note (ADR-002):** recommendation/evaluation are backend application services
calling a server-side LLM — they are **not** a generic agent framework and do
**not** require a separate `interview-agent` service. Evaluation runs as an
in-backend background job (extractable later).

---

# 10. Phased Implementation Plan

## Phase 0 — Freeze the Successful MVP

### 0.1 Baseline

Document:

- CLI architecture
- Voice Live configuration
- audio format
- VAD/AEC configuration
- tool interface
- environment variables

### 0.2 Regression test

Verify:

- model speaks first
- candidate introduction works
- natural conversation works
- context is remembered
- `get_current_problem` works
- duplicate tool events execute once
- barge-in works
- interview can be ended
- audio playback works

### 0.3 Baseline metrics

Capture:

- first-response latency
- normal response latency
- barge-in detection latency
- cancellation latency
- playback flush latency
- tool latency

**Exit criteria:** Current CLI remains reproducibly usable.

---

# Phase 1 — Domain Model and Backend Foundation

## 1.1 Domain entities

Define:

- User
- Interview
- InterviewConfiguration
- Problem
- InterviewProblem
- CandidateResponse
- Evaluation
- InterviewEvent

## 1.2 Lifecycle

Implement:

```text
created
ready
in_progress
completing
completed
cancelled
failed
```

## 1.3 API boundaries

Initial API:

```text
POST   /interviews
GET    /interviews/:id
POST   /interviews/:id/start
POST   /interviews/:id/end
GET    /interviews/:id/state
GET    /problems/:id
```

## 1.4 Tool service

Move MVP tools behind backend domain services.

**Exit criteria:** Backend can create and manage an interview without the CLI owning authoritative state.

---

# Phase 2 — Persistence

## 2.1 Database integration

Implement:

- schema
- migrations
- repositories
- indexes
- transaction boundaries

## 2.2 Interview persistence

Persist:

- creation
- start
- completion
- cancellation
- failure

## 2.3 Candidate interaction

Persist the information required for evaluation/history.

## 2.4 Evaluation persistence

Persist structured evaluation independently from raw conversation data.

**Exit criteria:** Process restart does not destroy authoritative interview state.

---

# Phase 3 — Production Voice Session Service

## 3.1 Session management

Define:

- session creation
- authorization
- connection lifecycle
- disconnect handling
- cleanup

## 3.2 Credential boundary

Ensure privileged Azure credentials never reach the client.

## 3.3 Tool routing

Route realtime model tool calls to backend domain services.

## 3.4 Failure handling

Handle:

- websocket disconnect
- model errors
- tool errors
- timeout
- client disappearance

## 3.5 Observability

Add production lifecycle and timing metrics.

**Exit criteria:** Voice Live becomes a reusable product service rather than a CLI-only integration.

---

# Phase 4 — Web Client

## 4.1 Interview setup

Build:

- interview selection
- difficulty/configuration
- start action

## 4.2 Realtime interview UI

Build:

- microphone state
- assistant speaking state
- candidate speaking state
- connection state
- timer
- end interview

## 4.3 Problem display

Display canonical problem data from the backend.

## 4.4 Coding workspace

Add a code editor for DSA implementation.

## 4.5 Results

Display:

- score
- strengths
- weaknesses
- complexity assessment
- hints used
- final recommendation

**Exit criteria:** Candidate can complete a DSA interview through the web product.

---

# Phase 5 — Interview Intelligence

## 5.1 Interview configuration

Support:

```text
interview type
difficulty
duration
problem selection
interviewer configuration
evaluation criteria
```

## 5.2 Structured context

Provide the model with the application context it needs.

## 5.3 Adaptive follow-ups

Allow the model to probe candidate reasoning based on the conversation.

## 5.4 Hint policy

Introduce controlled hints so the interviewer does not unnecessarily reveal solutions.

## 5.5 Evaluation pipeline

Produce structured post-interview evaluation.

**Exit criteria:** The product consistently behaves like an interviewer rather than merely answering the problem.

---

# Phase 6 — Code Execution and Technical Evaluation

## 6.1 Submission

Candidate submits implementation.

## 6.2 Sandbox

Run code in an isolated environment.

Requirements:

- CPU limits
- memory limits
- execution timeout
- filesystem isolation
- network restrictions
- process isolation

## 6.3 Tests

Run visible and hidden test cases.

## 6.4 Evaluation integration

Combine execution results with conversational evaluation.

**Exit criteria:** Candidate code can be evaluated safely.

---

# Phase 7 — Security Hardening

## 7.1 Authentication

Implement user authentication.

## 7.2 Authorization

Users can access only their own interviews.

## 7.3 Secrets

No secrets in:

- source control
- client bundles
- logs
- public environment variables

## 7.4 Data protection

Define:

- retention
- deletion
- encryption
- access control
- audit requirements

## 7.5 Abuse protection

Add:

- rate limits
- session limits
- request validation
- resource quotas

**Exit criteria:** Security boundaries are explicit and tested.

---

# Phase 8 — Production Deployment

## 8.1 Containerization

Containerize backend services.

## 8.2 CI/CD

Automate:

```text
test
 -> build
 -> security checks
 -> deploy
```

## 8.3 Environments

Define:

```text
development
staging
production
```

## 8.4 Monitoring

Track:

- availability
- realtime failures
- Voice Live errors
- tool failures
- latency
- interview completion rate
- evaluation failures

**Exit criteria:** Product can be released and operated reliably.

---

# Phase 9 — Personalized Learning Loop (ADR-002)

The product is a learning/coaching tool: the user chooses the interview
**goal/type**, and the system decides **what to practice**, adapting from profile,
curriculum, skill state, and prior evaluations. This phase adds the learning
domains and the server-side LLM surface. Full task breakdown:
`docs/implementation-roadmap.md` (its Phases 1–16 map onto this HLD phase; its
Phase 1 aligns these docs).

Sub-phases:

- 9a Profile + onboarding
- 9b Curriculum (server-owned import + API)
- 9c Skills (`UserSkillState` + curriculum progress)
- 9d Recommendation service (synchronous, LLM + deterministic fallback)
- 9e Evaluation service (asynchronous background job, LLM)
- 9f Skill/curriculum update (deterministic application of the evaluation)
- 9g Adaptive loop closure (evaluation → skill update → next recommendation)
- 9h Server-backed history & progress (remove browser-local authority)

Constraints: backend owns truth; LLM is not the system of record; PostgreSQL
persists; Voice Live conducts; recommendation sync / evaluation async; no separate
`interview-agent` (ADR-002).

---

# Phase 10 — Product Expansion (interview types)

Only after DSA voice interviews are stable and the learning loop (Phase 9) is in
place.

Potential interview types:

```text
System Design
Behavioral
Backend
Frontend
Machine Learning
Resume-based
Company-specific
```

The realtime foundation and the learning domains (profile, curriculum, skills,
recommendation, evaluation) should remain shared; DSA-specific curriculum,
selection, and mastery thresholds live behind an implementation seam so other
types can be added without changing generic entities.

---

# 11. Where `interview-agent` Fits

**Decision (ADR-002): there is no separate `interview-agent` service for v1.**

The MVP did not show that `interview-agent` belongs in the realtime voice path,
and the learning-loop architecture does not require a separate service. Its
intended responsibilities are absorbed into backend application services:

```text
Voice Live
    |
    | realtime conversation
    v
Interview Session
    |
    +---- narrow tools ----------> Backend (interview state, submissions, end)
    |
    +---- learning loop ---------> Backend application services
                                   RecommendationService  ─► LLM
                                   EvaluationService      ─► LLM
                                   SkillUpdateService
                                   CurriculumService
                                        │
                                        v
                                   in-process background job runner
```

The realtime voice path stays as small as possible. Work that is asynchronous,
expensive, long-running, or not latency-sensitive (deep post-interview
evaluation, reports, personalized plans, analytics) runs as **backend background
jobs**, not as a separate agent service. The job runner is an abstraction so it
can be extracted to a dedicated worker later **without changing the domain
model or product architecture**.

---

# 12. Testing Strategy

## Unit tests

Test:

- domain services
- lifecycle transitions
- authorization
- tool handlers
- evaluation rules
- repositories

## Integration tests

Test:

- backend + database
- backend + Voice Live
- tool calls
- lifecycle

## Realtime tests

Test:

- connection
- microphone
- playback
- VAD
- AEC
- barge-in
- cancellation
- playback flush
- tool invocation

## End-to-end test

```text
create interview
    ->
start
    ->
assistant greeting
    ->
candidate introduction
    ->
problem discussion
    ->
candidate approach
    ->
implementation
    ->
evaluation
    ->
end
    ->
results
```

## CLI regression harness

Keep the CLI available as a lightweight realtime Voice Live test harness during development.

---

# 13. Performance Measurement

These are targets/measurements to establish, not current guarantees.

## Response latency

Measure:

```text
candidate speech end
        ->
response.created
        ->
first audio delta
```

## Barge-in latency

Measure:

```text
candidate speech detection
        ->
response.cancel
        ->
playback flush
        ->
audible assistant stop
```

## Tool latency

Measure:

```text
tool requested
 ->
tool execution
 ->
tool result
 ->
next model response
```

The MVP already demonstrated that local playback flush can be only a few milliseconds after the interruption event reaches the client.

---

# 14. Architecture Principles

1. **Model is not the database.**
2. **Backend owns truth.**
3. **Tools are narrow domain capabilities.**
4. **Realtime paths stay minimal.**
5. **Do not add abstractions without a demonstrated requirement.**
6. **Measure audio latency end-to-end.**
7. **Privileged credentials remain server-side.**
8. **Conversation history and application state are different concepts.**
9. **Every realtime tool call is deduplicated by `call_id`.**
10. **Keep the successful MVP CLI as a regression harness.**
11. **Domain state is ALWAYS persisted by the backend.** PostgreSQL is the source
    of truth; the browser is never authoritative for profile, interview,
    evaluation, skill, recommendation, or curriculum state.
12. **The LLM is not the system of record.** The LLM reasons, evaluates, explains,
    and proposes; the backend validates and persists all state (ADR-002).
13. **Two LLM surfaces, never coupled.** Realtime (Azure Voice Live) conducts the
    interview; a separate server-side Foundry deployment powers recommendation and
    evaluation behind provider-agnostic interfaces.
14. **Recommendation and evaluation are app-owned capabilities.** Model output is
    a proposal; recommendation is synchronous, evaluation is asynchronous, and
    neither is a realtime tool.

---

# 15. Technology Status Matrix

| Technology / component | Status | Confidence |
|---|---|---|
| TypeScript | Used successfully | High |
| Node.js | Used successfully | High |
| Azure Voice Live | End-to-end validated | High |
| `gpt-realtime-mini` | End-to-end validated | High |
| Server VAD | Validated | High |
| Server echo cancellation | Available; harness disabled (raw mic) | Medium/High |
| Azure deep noise suppression | Available; harness disabled (raw mic) | Medium/High |
| PCM16 24 kHz mono | Validated | High |
| Linux `arecord` | Validated | High |
| Linux `aplay` | Validated | High |
| Model tool calling | Validated | High |
| Tool call deduplication | Implemented/validated | High |
| Barge-in | Functional; latency variable | Medium |
| Persistent database | PostgreSQL 16 + Drizzle (S2/S8b) | Implemented |
| Web realtime client | React/Vite client (S4/S6) | Implemented |
| Authentication | Local accounts (S8c); prod identity S8d | Implemented (local) |
| Code sandbox | Local runner (S7a/S7b); container isolation pending | Medium |
| Profile / Curriculum / Skills | Planned (Phase 9, ADR-002) | Not yet |
| Recommendation service (LLM) | Planned (Phase 9, ADR-002) | Not yet |
| Evaluation service (LLM, async) | Planned (Phase 9, ADR-002) | Not yet |
| Server-side LLM (Azure AI Foundry) | Planned (ADR-002) | Not yet |
| Background job runner (in-process) | Planned (ADR-002) | Not yet |
| Production Voice Live architecture | Not yet validated | Not yet |
| Production scale | Not tested | Not yet |
| Separate `interview-agent` service | **Not required** (absorbed into backend, ADR-002) | Not justified |
| Generic agent framework | Not required by MVP | Not justified |

---

# 16. Final Architecture Position

The MVP changed the most important assumption about the project.

We do **not** need to build a large custom interview orchestration engine before the product can work.

The validated direction is:

```text
                   ┌──────────────────────┐
                   │      Candidate       │
                   └──────────┬───────────┘
                              │
                              v
                   ┌──────────────────────┐
                   │  Interview Coach UI  │
                   └──────────┬───────────┘
                              │  HTTP / Realtime
                              v
                   ┌────────────────────────────────────────┐
                   │            Backend (Fastify)           │
                   │  Auth · Profile · Interview ·          │
                   │  Curriculum · Skills                   │
                   │                                        │
                   │  RecommendationService ─► LLM          │
                   │  EvaluationService     ─► LLM (async)  │
                   │  SkillUpdateService · CurriculumService│
                   │  Background job runner                 │
                   └──────────┬─────────────────────────────┘
                              │
                              v
                        PostgreSQL
                        (source of truth)

   Realtime interview (separate):
   UI ──► Azure Voice Live ── tool calls ──► Backend tools ──► PostgreSQL
```

Two LLM surfaces (ADR-002): Azure Voice Live conducts the realtime interview; a
separate server-side Azure AI Foundry deployment powers recommendation and
evaluation. The LLM is not the system of record.

The next engineering objectives are therefore:

> **Productize the proven realtime interview loop while keeping the architecture
> deliberately simple**, and **add the personalized learning loop (Phase 9) as
> backend-owned application services** — see `docs/implementation-roadmap.md`.

