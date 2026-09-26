# Feature: Provider-switchable LLM transport

**From build-plan:** feature 21
**Build attempt:** 1
**Branch:** `feature/provider-switchable-llm-transport`
**Status:** verified

## Goal

Make the server-side text LLM (the "second AI" behind recommendations,
evaluations, and AI-only Submit) switchable between Azure AI Foundry and
Inception Mercury via environment config, by extracting the triplicated
chat-completions transport into one shared module with per-provider
entries. No prompt, parser, validation, persistence, or voice change.

## In scope

- New shared transport module in `packages/backend/src/` (e.g.
  `llm-transport.ts`): one timeout/abort/retry chat-completions call used
  by all three model classes, with a per-provider entry:
  - `azure`: URL `{ENDPOINT}/openai/deployments/{DEPLOYMENT}/chat/completions?api-version=...`,
    `api-key` header, body `{messages, temperature: 0.2, response_format: {type: "json_object"}}`,
    no `model` field. Unconfigured when endpoint or key is blank (current behavior).
  - `inception`: URL `{BASE_URL}/chat/completions` (default
    `https://api.inceptionlabs.ai/v1`), `Authorization: Bearer` header,
    body includes `model` (default `mercury-2.5`), temperature 0.7
    (Mercury resets < 0.5 with a warning, so the shared 0.2 must not be
    sent), same `response_format` + `choices[0].message.content`
    extraction. Unconfigured when the API key is blank (base URL and
    model have safe defaults, so the key is the only gate).
- Config: `LLM_PROVIDER=azure|inception` (default `azure`), plus
  `LLM_BASE_URL` and `LLM_MODEL` (provider defaults apply when blank).
  Keep `LLM_ENDPOINT`/`LLM_API_KEY`/`LLM_DEPLOYMENT`/`LLM_API_VERSION`/
  `LLM_TIMEOUT_MS`/`LLM_MAX_RETRIES` exactly as-is. Unknown
  `LLM_PROVIDER` behaves as unconfigured (no crash, same as missing
  keys). Document the three new keys in `.env.example` next to the
  existing `LLM_*` block.
- Rewire `AzureFoundryRecommendationModel`, `AzureFoundryEvaluationModel`,
  and `AzureFoundrySubmitVerdictModel` onto the shared transport,
  preserving class names, domain ports, prompt/parse functions, the
  `Deps` fetch-injection test seam, fallback behavior (recommendation /
  evaluation), and the 503 unconfigured paths (including submit-verdict's
  `VERDICT_NOT_CONFIGURED`).
- Unit tests: per-provider URL/auth/body/temperature, per-provider
  unconfigured rules, unknown provider, non-2xx surfacing (no invented
  content), shared timeout/retry; existing model + route suites stay green.

## Out of scope

- Non-OpenAI-compatible providers (a response-envelope adapter is future
  work, not this feature).
- Prompt, parser, validator, scoring, persistence, or API-shape changes.
- Voice realtime (`session.ts`, `voice-client.ts`, conduct lines).
- Live verification against real provider keys (keys are still unset;
  coverage is unit-level plus the existing unconfigured paths).
- Changing the Azure default or the local-dev fallback behavior.

## Build loop

`workflow.stepReview` is `feature`: work through all steps, then present
one final review packet. `checkpointCommits` is `disabled`: `/complete`
owns the work commit. Stop and revise this spec on any unresolved product
decision or material scope expansion.

## Build steps

- [x] 1. Shared transport + config (new `llm-transport.ts` with the
  provider entries, `LlmConfig.provider/baseUrl/model` parsing in
  `config.ts`, `.env.example` docs)
  - Done when: unit tests prove the azure entry reproduces the current
    request shape (deployment-path URL, `api-key` header, temp 0.2, no
    model field) and the inception entry sends Bearer auth, a `model`
    field, and temp >= 0.5; `pnpm typecheck` clean.
- [x] 2. Rewire the three model classes onto the transport (keep names,
  ports, prompts, parsers, Deps seams, fallbacks, 503 paths)
  - Done when: no model file contains its own fetch/timeout/retry loop;
    existing recommendation/evaluation/submit-verdict suites pass
    unchanged in behavior; `pnpm typecheck` clean.
- [x] 3. Provider switching + unconfigured rules (factories read
  `LLM_PROVIDER`, per-provider gates, unknown provider = unconfigured)
  - Done when: unit tests prove azure-default with blank keys stays
    unconfigured, inception with key set builds the Mercury request,
    unknown provider yields unconfigured models, and all prior suites
    stay green; final gate: `pnpm typecheck`, full `pnpm test`,
    web-client `vite build` with
    `NODE_OPTIONS=--max-old-space-size=8192`.

## Files / areas

- `packages/backend/src/llm-transport.ts` (new), `packages/backend/src/config.ts`,
  `.env.example`
- `packages/backend/src/recommendation-model.ts`,
  `packages/backend/src/evaluation-model.ts`,
  `packages/backend/src/submit-verdict-model.ts` (rewire only)
- `packages/backend/tests/` (new transport tests; existing suites untouched
  in behavior)

## Data / contracts

- Env: `LLM_PROVIDER` (`azure` default; `inception`; anything else =
  unconfigured), `LLM_BASE_URL` (default
  `https://api.inceptionlabs.ai/v1`; unused by azure), `LLM_MODEL`
  (default `mercury-2.5`; unused by azure, which keeps `LLM_DEPLOYMENT`).
- Request/response envelope: OpenAI chat-completions shape both ways
  (`response_format: {type: "json_object"}`,
  `choices[0].message.content`); provider HTTP errors (including
  Inception 402) surface as model errors, never parsed content.
- Error semantics preserved: invalid/unusable output -> existing 502
  paths; missing keys (per provider) -> existing unconfigured/fallback /
  503 paths.

## Testing

- New transport unit tests (provider request shapes, temperature floor,
  unconfigured rules, unknown provider, non-2xx, timeout/retry) runnable
  under `pnpm test`.
- Existing suites (recommendation, evaluation, submit-verdict incl. route
  tests) must pass with no behavior change.
- Final gate: `pnpm typecheck`, full `pnpm test`, web-client `vite build`
  with `NODE_OPTIONS=--max-old-space-size=8192`.
- Manual try path: none against live providers (no keys); the
  unconfigured 503/fallback paths remain manually exercisable as today.

## Notes for the AI

- `LlmFetch` and `ChatMessage` currently live in
  `recommendation-model.ts`; the shared module should own them (update
  the re-export so the submit-verdict test import keeps working).
- `extractChatContent` (recommendation-model.ts) already parses the
  shared envelope; reuse it, don't duplicate it.
- Mercury `temperature` below 0.5 is reset server-side with a warning:
  the inception entry must never forward the azure 0.2 value.

## Open questions

None. Inception request/response details were verified against
https://docs.inceptionlabs.ai/ during exploration; anything
non-compatible found during implementation revises this spec instead of
being improvised.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":6794,"specSha256":"b9b014382e87fe593d24af99594399a7f3d3c6590e8e895a42fb3fd57621ea19","branch":"refs/heads/feature/provider-switchable-llm-transport","head":"8791b0b66ebddc4cc23bd0a66f90b9c27ef24d84","baseRef":"refs/heads/main","baseCommit":"8791b0b66ebddc4cc23bd0a66f90b9c27ef24d84","sourceTree":"e0f6a9b8375201772d4a69d2c225cf60655cd844","absentOptional":[]} -->
## Completion record

Feature 21 (build attempt 1) on branch `feature/provider-switchable-llm-transport` (base `main@8791b0b`, no prior archive at this path). One shared OpenAI-compatible chat-completions transport with per-provider entries, behind `LLM_PROVIDER`.

- `packages/backend/src/llm-transport.ts` (new): owns `LlmFetch` / `ChatMessage` / `extractChatContent` / `defaultFetch` (label-parameterized) moved verbatim from `recommendation-model.ts`, plus `resolveLlmProvider` (azure/inception, anything else null), `isProviderConfigured` (azure needs endpoint + key; inception needs key only; null never configured), `buildChatRequest` (azure reproduces the deployment-path URL / `api-key` header / temp 0.2 with no model field; inception sends `{base}/chat/completions` with Bearer auth, `model`, temp 0.7 — never the azure 0.2 Mercury would reset), and the retrying `postChatCompletions` loop (429/5xx retryable, permanent failures immediate, last error wins).
- Rewire: `AzureFoundryRecommendationModel`, `AzureFoundryEvaluationModel`, `AzureFoundrySubmitVerdictModel` build via `buildChatRequest` + one `postChatCompletions` call; ~290 lines of triplicated loop deleted. Class names, domain ports, prompts, parsers, fallbacks, and every error string preserved. `Deps` keeps `fetchImpl` and gains optional `provider`/`baseUrl`/`model` (absent = azure, so existing tests exercise the unchanged path).
- Config (`config.ts`, `.env.example`): `LlmConfig` gains `provider` (`LLM_PROVIDER`, default `azure`), `baseUrl` (`LLM_BASE_URL`, Inception default), `model` (`LLM_MODEL`, `mercury-2.5` default). Factories resolve the provider and fall back to the Unconfigured models per-provider (unknown provider = unconfigured, never a crash).
- Tests: new `llm-transport.test.ts` (14: request shapes, temperature floor, gates, retry loop, `defaultFetch` label) and `evaluation-model.test.ts` (4: factory selection); extended recommendation/submit-verdict factory suites (inception instance, unknown → unconfigured, stubbed-fetch Mercury request proof). `LlmFetch`/`extractChatContent` re-exported from `recommendation-model.ts` for existing importers.

Final gates (this session, after all product changes): `pnpm typecheck` clean (re-run in `/complete`), full `pnpm test` 75 files / 1200 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`); focused backend suites 42/42.

Manual try: none against live providers (keys still unset) — by design behavior is byte-identical (azure default, blank keys → fallbacks/503s). To exercise Mercury later: set `LLM_PROVIDER=inception` + `LLM_API_KEY` in the backend `.env` and restart.

Build plan: 21 checked off (no parent — top-level item). `project-plan.md` §3 updated per user approval (18d moved to shipped, Next is 19 + 21). Overview `blueprint:source-hash` re-stamped per the checkbox-normalized contract.

No findings resolved by this feature; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: server-side config plus deletion of triplicated transport; no new endpoint, secret flow, persisted data, or trust boundary).
