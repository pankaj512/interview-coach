# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P2] fixed - docs/deployment.md sandbox section describes the deleted local runner

**File:** docs/deployment.md:50-61
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** The live operator doc still says `LocalCodeRunner` executes candidate code in-process and refuses to run in production unless `ALLOW_INSECURE_CODE_RUNNER=true`. Both the file and the flag are deleted by this feature, and production now executes via the Docker runner. An operator following this section would set a nonexistent flag and misunderstand prod behavior. The spec required removing `ALLOW_INSECURE_CODE_RUNNER` docs mentions.
**Suggested fix:** Rewrite the section to describe the Docker runner (per-run `--network=none` containers, `SANDBOX_*` caps, image-pull requirement, socket mount, no-daemon means `error` runs). Historical audit docs under `docs/audit/` and the `SESSION_HANDOFF.md` history log stay untouched.
**Resolution:**

### F-02 [P2] fixed - C++ Value::quoted leaves C0 control characters unescaped, producing invalid JSON

**File:** packages/backend/src/cpp-harness.ts:95-106
**Found:** 2026-09-17 by /audit (scope: current; lens: tests)
**Why it matters:** `quoted()` escapes `\\`, `"`, `\n`, `\r`, `\t` but passes `\b`, `\f`, and other C0 controls (e.g. `\x01`) through raw, which is invalid JSON. A candidate returning such a string (or an `e.what()` message containing one) makes the whole run parse as `error` ("Harness emitted non-JSON output") instead of a per-case verdict. The JS harness (`JSON.stringify`) and Python harness (`json.dumps`) both escape these correctly, so C++ verdicts diverge from the other languages on reachable inputs.
**Suggested fix:** Escape every code point below U+0020 (except the already-handled `\n`, `\r`, `\t`) as `\uXXXX` in `quoted()`, mirroring `cEscape()` on the TS side. Add a unit case with `\x01`, `\b`, `\f` round-tripping through `buildCppMain` output parsing.
**Resolution:**

### F-03 [P3] fixed - C++ JSON-lines parsing fails the whole run on any extra stdout line

**File:** packages/backend/src/docker-runner.ts:510-535
**Found:** 2026-09-17 by /audit (scope: current; lens: quality)
**Why it matters:** Candidate C++ code that prints debug output to stdout interleaves non-JSON lines with verdict lines, and the first such line turns the entire run into an `error` outcome. The JS/Python single-JSON protocol reads the last line and tolerates extra output, so the languages behave inconsistently for the same debugging habit.
**Suggested fix:** None required for the current contract (submissions define `solve`; stdout printing is unspecified). If taken up, skip non-JSON lines that do not collide with verdict rows rather than failing the run, and cover it with a stubbed-spawn unit test.
**Resolution:**

### F-04 [P3] fixed - Per-run containers omit --security-opt=no-new-privileges

**File:** packages/backend/src/docker-runner.ts:241-270
**Found:** 2026-09-17 by /audit (scope: current; lens: security)
**Why it matters:** Defense in depth on the new security boundary. The flags already drop all capabilities, use a read-only rootfs, `--user 65534:65534`, and `--network=none`, so the residual risk is low; `no-new-privileges` would additionally block setuid/setgid privilege escalation inside the container at zero functional cost.
**Suggested fix:** Add `"--security-opt", "no-new-privileges"` in `buildRunArgs` and extend the `buildRunArgs` unit assertion.
**Resolution:**

### F-05 [P2] fixed - Missing/corrupt dataset file triggers destructive title-only reseed

**File:** packages/db/src/seed.ts:91-97
**Found:** 2026-09-23 by independent review of 18b (target 85e673e)
**Why it matters:** A dataset read/parse failure falls through to upserting all 300 catalog rows title-only (`null` starters/runner_links), and `save` is `onConflictDoUpdate`, so a missing or corrupt `problem-content-enrichment.json` actively wipes existing enrichment. Recoverable by re-running seed once the file is restored, and the gap report makes it visible, but aborting when zero records load would be safer.
**Suggested fix:** Abort the seed (non-zero exit, no upserts) when the dataset file is missing/unparseable or yields zero records, instead of reseeding title-only.
**Resolution:**

### F-06 [P3] fixed - Malformed runner link is silent in the gap report

**File:** packages/db/src/seed.ts:58-75
**Found:** 2026-09-23 by independent review of 18b (target 85e673e)
**Why it matters:** A malformed link returns `undefined` with no warning and no distinct gap reason, so a dataset regression is indistinguishable from a legitimate gap in the report.
**Suggested fix:** `console.warn` each malformed link with its problem id and reason, per the existing `seed skip` stdout precedent.
**Resolution:**

### F-07 [P3] fixed - Round-trip test covers only the python link

**File:** packages/db/tests/persistence.test.ts:70-92
**Found:** 2026-09-23 by independent review of 18b (target 85e673e)
**Why it matters:** The test never exercises the spec-noted method-sequence `entry: ""` verbatim path nor the `javascript`/`cpp` keys, and there is no domain-level `createProblem` passthrough test. Low risk (`toRunnerLink` accepts `""`, mapping is a shallow spread) but unproven.
**Suggested fix:** Extend the round-trip test with a method-sequence-link problem and all three language keys, plus a domain unit test for the starters/runnerLinks passthrough.
**Resolution:**

### F-08 [P2] fixed - Balanced-JSON extraction triplicated across three model parsers

**File:** packages/backend/src/recommendation-model.ts:91-113 (also evaluation-model.ts:86-110, submit-verdict-model.ts:70-92)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** The same ~20-line scanner (find first `{`, track brace depth while ignoring braces inside strings, slice, `JSON.parse`) is copied verbatim into `parseRecommendationProposal`, `parseEvaluationProposal`, and `parseSubmitVerdictProposal`. A parser correctness fix (escaping, string handling, pathological nesting) must be applied in three places or the parsers diverge.
**Suggested fix:** Add one `extractFirstJsonObject(content: string): string | null` to `packages/backend/src/llm-transport.ts` (already imported by all three) and have each parser call it before `JSON.parse`.
**Resolution:** Fixed on `fix/shared-json-extraction-helper`: the scanner lives once as `extractFirstJsonObject` in `llm-transport.ts` (same semantics, no behavior change); all three parsers call it and keep only their own `JSON.parse` + contract validation. Existing parser tests pass unchanged; full gates green (typecheck, 1248 tests, build).

### F-09 [P2] fixed - Dead manual-answer components and primitive remain in the client

**File:** packages/web-client/src/components/AnswerForm.tsx:12 (also HintPanel.tsx:22, ds/primitives.tsx:331)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** `AnswerForm`, `HintPanel`, and `ProgressChecklist` are exported but never imported anywhere outside their own definitions, so they ship dead code. They are leftovers from the retired manual-answer / text-mode path the overview says is gone (MVP is voice-only).
**Suggested fix:** Delete `AnswerForm.tsx` and `HintPanel.tsx`, remove the `ProgressChecklist` export, and drop any import that becomes unused.
**Resolution:** Fixed on `fix/remove-dead-client-and-domain-code`: both component files deleted, `ProgressChecklist` export removed from `ds/primitives.tsx`; names occur nowhere under `packages/web-client/src`. Web-client typecheck clean, no test changes.

### F-10 [P3] fixed - Unused exported domain helpers

**File:** packages/domain/src/result.ts:17 (also tool-service.ts:98,102; evaluation-job.ts:24; hints.ts:11; curriculum.ts:27; skill-update.ts:43; submission-service.ts:272,276; ids.ts:83,99,107,111)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** These exports have no callers in source or tests: `isOk`, `mapResult`, `andThen`; `isCanonicalToolName`, `isDeprecatedToolAlias`; `isEvaluationJobStatus`; `MIN_HINT_LEVEL`; `curriculumIdForInterviewType`; `isSkillDecision`; `parseTestCasesForRun`, `parseLimitsForRun`; `asResponseId`, `asEventId`, `asMessageId`, `asEvaluationJobId`. Dead surface costs maintenance and misleads readers about the API. (`isErr`, `ok`, `err`, and the other branded-ID helpers are used and must stay.)
**Suggested fix:** Delete the unused exports; re-add each when a real caller appears.
**Resolution:** Fixed on `fix/remove-dead-client-and-domain-code`: all 15 listed exports deleted across the eight domain files; `isErr`, `ok`, `err`, and the used branded-ID helpers remain. Repo typecheck clean, full suite green with no test changes.

### F-11 [P2] fixed - Config field dead, and same env var re-parsed without validation

**File:** packages/backend/src/voice-session.ts:113-115 (and config.ts:15,144)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** `VoiceConfig.ephemeralTtlSeconds` is populated by the validating `num()` helper but never read. `createVoiceSessionProviderFromEnv` instead re-reads `VOICE_EPHEMERAL_TTL_SECONDS` directly with `Number(ttlRaw)` and no finite/positive check, so a garbage value yields `NaN` and an invalid `expiresAt`. Two sources of truth where only the unused one validates.
**Suggested fix:** Read the loaded config value in `createVoiceSessionProviderFromEnv` (or delete the config field and keep a single validated parse); remove the unvalidated duplicate.
**Resolution:** Fixed on `fix/voice-session-ttl-config`: the factory now takes the validated `config.voice.ephemeralTtlSeconds` as a required parameter (both `app.ts` and `server.ts` call sites pass it); the duplicate `Number()` env parse is deleted, so garbage TTL fails fast in `loadConfig`. Covered by a new unit case.

### F-12 [P2] fixed - app.ts is one 1880-line module with inlined handlers far over the function-size guideline

**File:** packages/backend/src/app.ts:371-1845
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** `buildApp` spans roughly 1473 lines with every route handler inlined; individual handlers (for example `POST /api/interviews/:id/voice-session` at 1698-1828, `POST /api/interviews/:id/tool-exec` at ~1698-1830) run ~130 lines each. The standards ask to keep functions under 50 lines when possible. Size at this level makes navigation, review, and isolated testing hard.
**Suggested fix:** Extract route handlers (at least the largest) into per-concern modules that `buildApp` registers.
**Resolution:** Fixed on `fix/app-header-and-handler-extraction`: the four largest handlers (voice-session, submit-verdict, runs, tool-exec) moved verbatim into `packages/backend/src/routes/` modules behind `register*Routes(app, ctx)` calls; shared schemas/helpers moved to `routes/shared.ts`; `app.ts` shrank 1882 -> 1390 lines with no behavior change (full suite green).

### F-13 [P3] fixed - Stale hand-maintained route map in app.ts header, itself a banner block

**File:** packages/backend/src/app.ts:1-54
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** The 54-line header comment enumerates routes but already omits at least `DELETE /api/learning-state` (registered at app.ts:808) and `POST /api/interviews/:id/submit-verdict` (app.ts:1384), so it is misleading. It also conflicts with the standard banning banner/header blocks. (Related niche duplication: `siblingSource` is copied verbatim in shape-runners/javascript/assemble.ts:53 and shape-runners/python/assemble.ts:61; `sandboxTestCaseSchema` at app.ts:309 is misformatted.)
**Suggested fix:** Remove the route enumeration and rely on the registrations; optionally share `siblingSource`. Reformat `sandboxTestCaseSchema`.
**Resolution:** Fixed on `fix/app-header-and-handler-extraction`: the 46-line route enumeration is deleted (8-line module summary kept); `sandboxTestCaseSchema` reformatted one-property-per-line in its new home `routes/runs.ts`. The optional `siblingSource` sharing was deliberately left as-is per the fix spec.

### F-14 [P2] fixed - Pervasive em dashes violate the Writing standard

**File:** packages/backend/src/app.ts:1865 (also many files across backend, domain, web-client, and tests)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** The Writing standard bans em dashes (U+2014) in generated content, including code comments. They appear in source comments and user-facing copy across dozens of files (for example app.ts:1865, voice-session.ts:187,226, evaluation-model.ts:1, llm-transport.ts:1, auth.ts:1,4,5,112, domain/evaluation-model.ts:1, and client screens such as CodeWorkspace.tsx:459,466,510,513,536, LobbyScreen.tsx:209). The rule is enforced in intent: `packages/web-client/tests/render-smoke.test.tsx:352` asserts rendered HTML contains no `—`. Only the deliberate empty-value placeholder glyph may be legitimate.
**Suggested fix:** Replace prose em dashes with hyphens or commas; keep the deliberate placeholder glyph only if the user confirms it.
**Resolution:** Fixed on `fix/remove-em-dashes`: 242 replacements (194 em, 3 en, 45 ellipsis) across 112 files under `packages/`; placeholders and prose both use `-`/`...` per user call; 7 line-wrapped breaks rephrased; `docs/` and `blueprint/history/` untouched as immutable logs. One intentional U+2014 remains in the `render-smoke` guard assertion that enforces the rule. Full suite green.
