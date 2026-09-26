# Feature: AI-only Submit

**From build-plan:** feature 18d
**Build attempt:** 1
**Branch:** `feature/ai-only-submit`
**Status:** verified

## Goal

Give the candidate a Submit button next to Test in the interview code editor that returns a backend second-AI verdict on the live editor code: correctness, optimality (time/space), break-points (inputs or conditions where the code fails or degrades), and edge cases worth considering. Voice stays interview-only: no voice-tool or instruction changes.

## In scope

- New domain submit-verdict contract: input (problem context, language, code) and a validated verdict proposal shape.
- New backend verdict model reusing the existing Azure chat-completions pattern (`evaluation-model.ts` / `recommendation-model.ts`); reuses the existing `LlmConfig`, no new env vars.
- New backend route taking `{language, code, problemId?}` directly from the editor; no sandbox run; no persisted submission, verdict, or event rows in this pass (build-plan: "no persistence in this pass").
- Web client: `submitVerdict` client method plus a Submit button and verdict card in `CodeWorkspace`; the stale "No Submit button" note is updated.
- Focused unit tests for the contract, prompt/parse, route guard mapping, and client method.

## Out of scope

- Sandbox execution for Submit, persisted verdicts or verdict history, Submit outside a live interview.
- Voice surface changes (no new realtime tool, no instruction edits); run outcomes still come from Test.
- New LLM deployment, env var, dependency, or shared abstraction.

## Build loop

`workflow.stepReview: feature` — build all steps, then one final review packet. `checkpointCommits: disabled` — `/complete` owns the work commit. No `Verify` command is declared; the final gate is the fallback `pnpm typecheck` + `pnpm test` + web-client `vite build` (8 GB heap flag).

## Build steps

- [x] 1. Domain submit-verdict contract
  - Add `SubmitVerdictInput` (`problemId?`, title, statement, constraints, language `c++|javascript|python`, code <=50k mirroring the submission cap) and `SubmitVerdict` (`correctness: correct|incorrect|uncertain` + notes, `optimality` (judged time/space + notes), `breakPoints: string[]`, `edgeCases: string[]`, `summary`) plus `validateSubmitVerdictProposal` in `packages/domain/src`, mirroring `evaluation-model.ts` (`validateEvaluationProposal`).
  - Done when: new domain unit tests cover a valid verdict, each rejection class (bad correctness value, missing arrays, wrong types), and the code-length cap; `pnpm typecheck` clean.

- [x] 2. Backend verdict model (pure prompt/parse + chat client)
  - Add `packages/backend/src/submit-verdict-model.ts` mirroring `evaluation-model.ts`: deterministic `buildSubmitVerdictMessages` (system prompt demanding JSON-only with the exact verdict shape; user message carries problem context + language + code), JSON-extraction parse validated by the domain contract, `AzureFoundrySubmitVerdictModel` with timeout/retry semantics copied from the evaluation model, `UnconfiguredSubmitVerdictModel` returning `{ proposal: null, error }`, `createSubmitVerdictModelFromEnv(config.llm)` — no new env vars.
  - Failures are data, never an invented verdict: timeout/HTTP/unparseable/invalid yield `{ proposal: null, error }`.
  - Done when: backend unit tests cover prompt shape, valid parse, fence-tolerant parse, invalid-JSON rejection, and the unconfigured path; `pnpm typecheck` clean.

- [x] 3. Route plus client method
  - Add `POST /api/interviews/:id/submit-verdict` in `packages/backend/src/app.ts` with a zod body (`language`, `code`, `problemId?`): same ownership/status guards as `POST /:id/submissions` (confirm from that route's existing evidence in the step; map denials through `sendDomainError`), no `submissions.submit` call, no events. Unconfigured model maps to a 503 with plain copy ("code судить unavailable" is wrong language — use: "Submit verdict is unavailable right now. Try again later."); model failure maps to 502; success returns `{ ok: true, verdict }`.
  - Add `submitVerdict` to `packages/web-client/src/api/backend-client.ts` plus input/result types in `api/types.ts`.
  - Done when: route tests (or existing harness equivalent confirmed in-step) cover denied interview, invalid body, unconfigured model, and success shape; client method test covers request shape; `pnpm typecheck` clean.

- [x] 4. Submit button and verdict card
  - `CodeWorkspace.tsx`: a Submit button beside Test (busy state "Submitting…", disabled while busy or code empty with the same "Write code before submitting." guard as Test), verdict card below the actions row (`aria-label="Submit verdict"`) rendering correctness, optimality, break-points, and edge cases; API errors via the existing `formatApiError` path. Replace the "No Submit button" note with copy stating Submit asks the AI judge and persists nothing.
  - Done when: manual try in a live interview — write code, Submit, verdict card renders all four sections; empty-code guard fires; Test flow unchanged; `pnpm typecheck` clean.

## Files / areas

- `packages/domain/src/` — new verdict contract (new file alongside `evaluation-model.ts`).
- `packages/backend/src/submit-verdict-model.ts` (new), `packages/backend/src/app.ts` (one route).
- `packages/web-client/src/api/types.ts`, `api/backend-client.ts`, `components/CodeWorkspace.tsx`.
- Tests beside each area, following existing suites (`tool-service-s7`, backend model tests, `backend-client-s7`).

## Data / contracts

- Request: `{ language: "c++"|"javascript"|"python", code: string<=50k, problemId?: string }`.
- Response: `{ ok: true, verdict: SubmitVerdict }` or the existing domain-error envelope.
- `SubmitVerdict`: `{ correctness: "correct"|"incorrect"|"uncertain", correctnessNotes: string, optimality: string, optimalityNotes: string, breakPoints: string[], edgeCases: string[], summary: string }` — exact field names frozen in step 1; prompt and validator must agree byte-for-shape.
- Nothing persisted: no `CodeSubmission`, no verdict row, no interview event.

## Testing

- Domain contract tests, backend prompt/parse + unconfigured tests, route guard/error mapping tests, client method test (all runnable under `pnpm test`).
- Final gate: `pnpm typecheck`, full `pnpm test`, web-client `vite build` with `NODE_OPTIONS=--max-old-space-size=8192`.
- Manual try path (step 4 done-when); no browser harness exists.
- Live-try follow-up (2026-09-27): unconfigured LLM keys surfaced as 502
  VERDICT_FAILED with the raw message; repaired on-branch to the specified
  503 VERDICT_NOT_CONFIGURED with plain copy (route test added). User
  decision: Submit stays gracefully unavailable until LLM keys are
  configured; no env change in this feature.

## Notes for the AI

- "Second-AI" means a second opinion beyond the voice interviewer, not a second deployment: reuse `config.llm` exactly as `createEvaluationModelFromEnv` does.
- Never invent a verdict on model failure; surface the error and keep Test results as the only executed evidence.
- Voice files (`session.ts`, `voice-client.ts`, backend `voice-session.ts` conduct lines) are untouched; a diff touching them is out of scope.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":7192,"specSha256":"a7e4ab3894284fc29036ea7c2bd17efe7fe62f776928bccbe282a81b8a4f1ad1","branch":"refs/heads/feature/ai-only-submit","head":"09f6fe78ba7f0c99e154ba452c0e23813db23784","baseRef":"refs/heads/main","baseCommit":"09f6fe78ba7f0c99e154ba452c0e23813db23784","sourceTree":"4158e3bf50752d6f5d33a55e9633597d7cd44f37","absentOptional":[]} -->
## Completion record

Feature 18d (build attempt 1) on branch `feature/ai-only-submit` (base `main@09f6fe7`, no prior archive at this path). AI-only Submit: a second-AI verdict on live editor code with no sandbox run and zero persistence.

- `packages/domain/src/submit-verdict.ts` (new): `SubmitVerdict` / `SubmitVerdictProblem` / `SubmitVerdictInput` / `SubmitVerdictModel` plus `validateSubmitVerdictProposal` and `validateSubmitVerdictInput` (50k code cap, 400-char / 12-item normalization mirroring `evaluation-model.ts`). Exported from the domain index. Tests: `packages/domain/tests/submit-verdict.test.ts` (6 tests).
- `packages/backend/src/submit-verdict-model.ts` (new): JSON-only system prompt, `buildSubmitVerdictMessages`, brace-matched `parseSubmitVerdictProposal`, `AzureFoundrySubmitVerdictModel` with timeout/abort/retry mirroring `evaluation-model.ts`, `UnconfiguredSubmitVerdictModel`, `createSubmitVerdictModelFromEnv` off the existing `config.llm` (no new env). Tests: `packages/backend/tests/submit-verdict-model.test.ts` (5 tests mirroring `recommendation-model.test.ts`).
- `POST /api/interviews/:id/submit-verdict` in `packages/backend/src/app.ts`: submitCode-like guards (zod body, ownership/status via `sendDomainError`), explicit `problemId` else the interview's current problem, `Deps.submitVerdictModel` test override, zero persistence (`code.verdict` log only). Null/invalid proposal or judge throw maps to 502 `VERDICT_FAILED`; unconfigured model maps to 503 `VERDICT_NOT_CONFIGURED` with plain copy (repaired on-branch after the live try surfaced it as a 502 with the raw message). `packages/backend/src/serializers.ts` gains `SerializedSubmitVerdict`. Tests: `packages/backend/tests/submit-verdict.test.ts` (6 tests: 200 + null-problem + no persistence, 400, 404, 502, explicit problemId mapping, 503 unconfigured).
- Client: `SerializedSubmitVerdict` in `api/types.ts`, `backend-client.submitVerdict(id, SubmitCodeInput)`.
- UI: `CodeWorkspace.tsx` gains "Submit for AI verdict" beside Test (shared busy, "Submitting…", "Write code before submitting." empty guard) and a `Submit verdict` card (correctness, optimality, break-points, edge cases, summary); API errors via `formatApiError`; note copy now states Submit asks the AI judge and persists nothing. Test flow unchanged.

Final gates (this session, after all product changes): `pnpm typecheck` clean, full `pnpm test` 73 files / 1177 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`); focused submit-verdict route suite 6/6.

Manual live try: Submit without LLM keys configured now returns the friendly "Submit verdict is unavailable right now. Try again later." User decision (recorded in spec): Submit stays gracefully unavailable until `LLM_ENDPOINT`/`LLM_API_KEY` are configured in the backend `.env` (backend restart picks them up; no code change needed). Live verdict-content proof is pending keys.

Build plan: 18d checked off; all 18 sub-items complete so parent 18 checked off. Overview `blueprint:source-hash` re-stamped per the checkbox-normalized contract.

No findings resolved by this feature; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: the candidate's own code judged by the pre-existing configured model at the candidate's request; no new endpoint trust boundary, secret, or persisted data).
