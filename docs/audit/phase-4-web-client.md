# Audit — Phase 4: Web Client

- **HLD phase:** Phase 4 (Web client)
- **Implemented in:** S4 + S6 + S6.1 (`@interview-coach/web-client`), tags `session-4/6/6-1`
- **Source of truth:** HLD §10 Phase 4, §3.1–3.5 (planes), §5.4/§5.8 (problem/eval
  shapes), §14; frozen §2/§3/§5/§7; `docs/interview-coach-product-decisions.md`,
  `docs/interview-coach-ui-specification.md` (secondary, S6 rebuild)
- **Scope of this audit:** `packages/web-client` — control-plane client
  (`api/`), the browser voice loop (`voice/`), the interview hooks (`state/`),
  and the S6 screen/DS layer against HLD 4.1–4.5 and frozen §5 (tool-call
  reliability). Later-phase transport (S5 intelligence, S7a sandbox, S8a/c
  auth/rate-limits) is covered only where it interacts with the S4 voice/control
  path; those phases have their own audits. Voice *media* correctness (the
  WebAudio adapters) is exercised by real hardware only — the pure conversion
  pipeline and event handling are what vitest covers.

## Exit criteria (HLD, quoted)

> **Exit criteria:** Candidate can complete a DSA interview through the web
> product. (§10 Phase 4)

## Checklist vs HLD

### 4.1 Interview setup
- [x] Interview selection — `SetupScreen` format cards (DSA active; System
      design disabled with "Soon" copy), candidate id, difficulty pills.
- [x] Difficulty/configuration — difficulty, duration (clamped 480), problem
      count (clamped 1..20), topic focus, auto-select toggle, manual browser
      (`GET /api/problems` search + difficulty filter) and raw-id field.
- [x] Start action — Continue → Devices gate → Lobby recap → Join (mint +
      connect). Backend-owned create→assign/select→ready in `useInterviewSetup`.

### 4.2 Realtime interview UI
- [x] Microphone state — `DevicesScreen` mic gate (live level meter blocks
      Continue; denial keeps the candidate there with a guided fix) + `VoiceState`
      rail in the room.
- [x] Assistant speaking state — `onAssistantSpeaking` → `VoiceState` "Speaking".
- [x] Candidate speaking state — `onCandidateSpeaking` → "Listening" + wave.
- [x] Connection state — `StatusChip` (connected/reconnecting/mic-blocked/
      idle/closed/failed) over `VoiceConnectionState`.
- [x] Timer — `Timer` remaining/elapsed, Low < 5 min (ambient, non-anxiety).
- [x] End interview — guarded `DangerButton` → confirm dialog ("…moves the
      interview to Completing… cannot be undone").

### 4.3 Problem display
- [x] Canonical problem data from the backend — `ProblemPanel` over the
      `GET /state` snapshot; never invents content when unset.

### 4.4 Coding workspace
- [x] Code editor for DSA — `CodePanel` (real S7a sandbox: submit → run →
      verdicts, python/javascript only).

### 4.5 Results
- [x] Score — `ScoreBar` per dimension (renders all backend-returned keys) +
      overall score.
- [x] Strengths / weaknesses — dedicated cards.
- [x] Complexity assessment — `complexity` is one of the 8 HLD 5.8 dimensions.
- [x] Hints used — results header line.
- [x] Final recommendation — overall + recommendation line (backend-derived).

### Cross-cutting (frozen §2/§5/§7)
- [x] No `VITE_AZURE_*`, no Azure SDK, no `node:crypto` in the bundle
      (`config.ts`, `api/types.ts:1-6`; bundle scan clean — only a `sk-type`
      false-positive substring).
- [x] Backend owns truth — client types are read-only structural mirrors.
- [x] Realtime audio never proxied — browser↔Voice Live direct over WS.
- [x] Tool path — `POST /tool-exec` + exactly-once `function_call_output`
      (ledger) + reload rehydration via `GET tool-results`.
- [~] frozen §5 reconnect — queue/flush mechanics exist, but there is no
      trigger wired (see C4-1).
- [~] frozen §5 retry policy — `retryable:true` (429) is not honored (see C4-2).

## Verification (run this session)

```
pnpm typecheck      # ok (tsc --noEmit)
pnpm test           # 258 passed (36 files) — persistence warn-and-pass w/o Postgres
pnpm build          # ok (tsc -b)
pnpm --filter @interview-coach/web-client build   # ok (314.45kB JS / 96.60kB gzip)
```

Result: all green. Web-client suites are DB-free by design (fakes only):
`backend-client` (10), `tool-forwarder` (12), `pending-store` (6), `audio` (9),
`session` (7), `voice-client` (10), `voice-args` (7), `ds-model` (10),
`s6-helpers` (4), `code-panel` (5), plus S5/S7/S8c client suites. Bundle
secret scan (dist) clean: no `VITE_AZURE_*`, no `services.ai.azure.com`, no
`AZURE_VOICE_API_KEY`, no `sk-` token.

## Findings

| ID | Severity | Evidence | HLD ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| C4-1 | Major | `use-interview.ts:127,168` vs `voice-client.ts:273-281`; `voice-client.ts:618-626`; `LiveScreen.tsx:214-224` | 4.2, frozen §5 | **Rejoin after an unexpected close is a no-op.** `VoiceInterviewClient.reconnect()` is defined but never called anywhere; `useLiveInterview.start()` early-returns when `clientRef.current !== null` (line 127), and only `hangup()` nulls it. An unexpected WS close sets state `closed` (`handleClose`) but leaves `clientRef` set, so the room's "Rejoin" button runs `start()` → immediate return. The "reconnecting" state card and its "queue + flush" copy are unreachable. Worse, `handleClose` never stops the mic, so a dropped session leaves the mic hot. Frozen §5's reconnect guarantee is mechanically implemented but has no trigger. | Null `clientRef` on close (or add a `rejoin` that calls `client.reconnect()`), stop the mic in `handleClose`, and wire auto/triggered reconnect. |
| C4-2 | Major | `backend-client.ts:284-297`; `tool-forwarder.ts:68-79` vs `app.ts:351` | frozen §5, HLD 3.4 | **tool-exec 429 (`retryable:true`) is never retried.** `toolExec` returns every error envelope as a `ToolExecFailure` with a hardcoded `retryable: false` (line 292), discarding the backend's `retryable` field; `isRetryableFailure` returns false for any non-ok outcome (line 70). The S8a rate limiter sends `429 {code:"RATE_LIMITED", retryable:true, Retry-After}` expressly "so the browser forwarder backs off with the same call_id", but the forwarder instead forwards it to the model as a permanent error output. Violates frozen §5 ("retry … retryable:true") and the S8a cross-phase handoff; untested. | Propagate `retryable` from the envelope into `ToolExecFailure`, and let the forwarder retry `retryable:true` outcomes (optionally honoring `Retry-After`). |
| C4-3 | Minor | `use-interview.ts:181-193`; no `beforeunload`/`pagehide` handler (grep) | 3.1, frozen §5 | **Abandon leaks the backend session (client half of V3-1).** The hangup path calls `DELETE /voice-session` (line 191), but tab close / browser crash never does — there is no `pagehide`/`beforeunload` hook and no heartbeat. Combined with backend V3-1 (no TTL sweep), an abandoned tab leaves an `activeVoiceSessions` entry until the map is exhausted (429s) or the process restarts. | Add a `pagehide` best-effort `DELETE` (or a heartbeat), and close backend V3-1 with an `expiresAt` sweep. |
| C4-4 | Minor | `components/{InterviewRoom,ResultsPanel,SetupForm,CodeEditor,StatusBar}.tsx` | 4.2/4.5 | **Dead legacy S4 components.** After the S6 screen rebuild (`App.tsx` routes through `screens/`), these five files are unimported (only self/peer references). They still typecheck and carry pre-S6 UX, so they are drift risk + a maintenance trap. | Delete them (and their now-dead imports), or mark them deprecated until removed. |
| C4-5 | Minor | `use-interview.ts:215-222` | 4.2 | **Elapsed timer freezes off-connection.** The timer interval only runs while `connection === "connected"`, so a reconnect/mic-blocked/closed window stops the visible count while wall-clock keeps running. Cosmetic, but the results/timer claim accuracy it does not deliver across a reconnect. | Tick from `connectedAtRef` whenever the interview is live (or use a monotonic clock start). |
| C4-6 | Nit | `LiveScreen.tsx:82-90`; `ds/model.ts:36-53` | 4.2, 5.5 | **No interview-status surfaced in the live room.** When the model calls `end_interview` the backend moves to `completing`, but the candidate sees nothing change — `StatusChip` reflects only the connection, not `snapshot.interview.status`. The wrap-up is silent until the candidate clicks End. | Show `snapshot.interview.status` (e.g. a "wrapping up" chip) in the room topbar. |
| C4-7 | Minor | `api/types.ts:34` vs `:156,173`; `SetupScreen.tsx:15`; `ds/status.tsx:85` | 5.1, UI §5 | **Carried-forward F1 (verified open).** The difficulty enum split is user-visible: config difficulty is `Easy\|Medium\|Mixed` while the browser/select paths use `Easy\|Medium\|Hard`; a candidate can filter "Hard" problems but cannot target a "Hard" interview, and "Mixed" exists only as a config target. `DiffPill` silently normalizes unknown values to "Medium". | Unify to one enum (`Easy\|Medium\|Hard\|Mixed`) across domain, API, and client (Phase-5 selection is the natural fix point). |
| C4-8 | Minor | `SetupScreen.tsx:70,76`; backend has no `setCurrentProblem` route (route scan) | 5.3/5.4 | **Carried-forward F2 (verified open).** Setup allows `problemCount`/manual picks up to 20, but no route or UI advances `currentOrder`/`currentProblem`, and `ProblemPanel` shows only the single current problem. A >1-problem interview is effectively single-problem. | Add problem advance/skip/complete (service + route + UI) in Phase 5, or cap `problemCount` to 1 until then. |

## Cross-phase observations (carried forward, not Phase-4 defects)

- **P2-2 (duplicate assign ids)** has a client vector: the raw-id field
  (`SetupScreen.tsx:43`) splits the user's text without deduplication, so
  `prob_3sum prob_3sum` reaches `assignProblems` → backend uncaught constraint
  error → 500. The checkbox picker dedupes; the text field does not. Root fix
  belongs in the backend (`assignProblems`), but a client-side `.filter`
  dedupe would harden the input path.
- The 8-point tool-latency chain (frozen §5) is emitted by `voice-client` as
  `onMetric` events (`tool.requested/start/complete`, `output_submitted`,
  `next_response_started`, etc.) but nothing aggregates or alerts on them
  client-side. Backend counters (S8a) cover the server half only. Alerting on
  E2E p95 > 6s remains unimplemented — verify the observability story in
  Phase 7/8.
- Transcript persistence: live captions come from model/user transcript
  events held only in the client `LiveEvent` list (lost on reload); canonical
  answer text is `POST .../responses` + `record_candidate_answer`. Results
  highlights are therefore the *latest 6 turns of the current session* only.
  Already deferred in S6/S6.1 — flag for Phase 5 (eval context) if
  cross-session highlights are wanted.

## Handoff to Phase 5 (Interview intelligence)

- C4-7/C4-8 (F1/F2) are the Phase-5 selection/progression surface: the S5
  `selectProblems`/selection path is where the difficulty enum must be unified
  and where multi-problem advance (or a documented single-problem MVP) must
  land. Verify the S5 backend half actually resolves them rather than
  mirroring the divergence a third time.
- C4-2 (429 not retried) is a contract the S5 `get_problem_hint` UI path also
  exercises (HintPanel drives `tool-exec` directly) — when it is fixed, confirm
  the UI-generated `call_id` path and the model path both retry identically.
- C4-1/C4-3 (reconnect + abandon) are voice-loop reliability items that Phase 5
  does not need, but they are the primary remaining blockers to a real
  multi-turn product interview; keep them on the hardening (S8) backlog if not
  fixed sooner.
- Verify Phase-5 evaluation context: `record_candidate_answer`/`responses`
  counts feed `get_candidate_performance` and the instructions builder; confirm
  the S5 client (`HintPanel`, `AnswerForm`, `EvaluationForm`) stays consistent
  with the backend `hintsUsed`/dimension accounting audited here.

Carried-forward inventory (open at Phase 4 close): F1, F2, F3, F4, F5, F6,
F7, F8, F9, F10 (Phase 1); P2-1, P2-2, P2-3, P2-4, P2-5, P2-6, P2-7, P2-8
(Phase 2); V3-1, V3-2, V3-3, V3-4, V3-5, V3-6 (Phase 3); C4-1 … C4-8 (this
phase).
