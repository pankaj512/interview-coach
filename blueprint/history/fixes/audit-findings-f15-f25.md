# Fix: Close audit findings F-15 through F-25

**Type:** Fix
**Status:** implemented and verified - all 7 steps done; `pnpm typecheck`, full `pnpm test` (79 files / 1248 tests), and `pnpm build` green on the branch. Ready for `/audit` re-review, then `/complete`.
**Branch:** fix/audit-findings-f15-f25
**Fixes:** F-15, F-16, F-17, F-18, F-19, F-20, F-21, F-22, F-23, F-24, F-25

## The problem

The 2026-09-30 full-project audit left 11 open findings (3 P2, 8 P3), all
verified present: dead client code (F-15, F-17, F-18), a five-way duplicated
voice tool-dispatch block (F-16) inside an oversized event handler (F-22),
backend/db duplications (F-19, F-20, F-25), a redundant DB index (F-23), and
comment/formatting drift (F-21, F-24). No P0/P1 is open, so nothing blocks
other work; this is quality debt cleanup.

Prerequisite note: `blueprint/context/findings.md` currently has uncommitted
changes on `main` (the audit's own ledger update). Commit those on `main`
first with a separate approval, then cut this fix branch, so the branch
starts clean.

## The fix

Delete what is dead, extract what is duplicated, and keep behavior identical.
No new abstraction, dependency, service, or config surface: every change is a
deletion, a move, or a mechanical extraction the findings already prescribed.
Migrations follow the repo rule (`drizzle-kit generate`, never `db push`).
No em dashes in touched lines (Writing standard; the render-smoke guard
enforces it).

## Build steps

### 1. Client dead code (done) (F-15, F-17, F-18)

- Delete the 13 unreferenced primitives in `ds/primitives.tsx` (Eyebrow,
  SectionTitle, SectionHead, CtaCard, ProgressTrack, TableShell, CoachPanel,
  TimelineRow, Segmented, RadioCard, ProgressItem, StatCard, ScoreRow) plus
  any types only they use, and the unused
  `export { GhostButton, PrimaryButton }` re-export (consumers import from
  `ds/buttons.js`). Keep every primitive that is actually mounted.
- Delete `getInterview` and `failInterview` from `api/backend-client.ts`.
- Remove `stale` state in `App.tsx` (state, prop, and the unreachable branch
  in `ResultsScreen.tsx`), render `DashboardScreen` directly, and delete the
  `DashboardView` wrapper and its false comment.
- Done when: each deleted name greps to zero under `packages/web-client/src`
  and web-client typecheck is clean.

### 2. Voice dispatch extraction (done) (F-16, F-22 headline)

- Extract one private `handleFunctionCall(item, fallback?)` helper in
  `voice-client.ts` covering parse `call_id`/`name`, guard `isToolName`,
  `parseToolArgs`, assign `pendingCall`, call `executeTool`; all five event
  branches call it with their existing fallback choice as a parameter.
- Done when: the dispatch block exists once, `handleServerEvent` is shorter,
  and existing voice tests pass unchanged.

### 3. Backend runner cleanup (done; cpp-runners host-g++ gate deferred to CI - assemble untouched, docker-runner.test.ts 15 green)

- `docker-runner.ts`: call `this.rawCases(testCases, context)` inside
  `writeAssembledCpp` instead of re-deriving inputs; keep the single pairing
  rule and error message in `rawCases`.
- Split same-line declarations onto their own lines in `docker-runner.ts:826`
  and `repositories.ts:1406`.
- Done when: no duplicated lookup/throw pair remains and backend typecheck
  plus runner tests are green.

### 4. Client formatting and divider cleanup (done) (F-21, F-24 client files)

- Delete the `// -----...` dividers in `recommendation.ts:195-197, 356-358`
  and the `// ---- ... ----` markers in `App.tsx`, keeping a one-line
  rationale only where the why is not obvious.
- Split same-line bodies in `CodeWorkspace.tsx:324`, `serializers.ts:370`,
  and `App.tsx:274-277`.
- Done when: the divider lines are gone and client typecheck is clean.

### 5. DB cleanup (done) (F-20, F-23)

- Extract a `toConfiguration(interview.configuration)` helper in
  `repositories.ts` and spread it into both the insert values and the
  `onConflictDoUpdate` set.
- Drop the redundant `users_email_idx` from `schema.ts`, generate the
  migration with `drizzle-kit generate`, and confirm `findByEmail` still
  resolves via the unique constraint.
- Done when: one mapping site, migration generated, db typecheck and
  persistence tests green (live-DB or warn-and-pass per standards).

### 6. Domain single-source kinds (F-25)

- Export a single `RESPONSE_KINDS` constant tuple from
  `candidate-response.ts`, derive `ResponseKind` from it, and reuse it in
  `tool-service.ts`. Evaluate the backend `RESPONSE_KINDS_TUPLE` in `app.ts`
  during implementation: reuse the domain constant if Zod accepts it,
  otherwise keep it with a one-line why comment.
- Done when: one source of truth for the kind list and domain plus backend
  typechecks are clean.

### 7. Remaining oversized functions (done) (F-22 residual)

- Extracted, behavior identical: `parseHarnessOutput` split into
  `parseSingleJsonProtocol` + `parseJsonLinesProtocol` protocol helpers;
  `runJob` split into `loadOrRecordEvaluation` + `finishJob` + `failJob`;
  `buildRecommendationCandidates` `add` closure + limit logic extracted into
  a `CandidateCollector` helper.
- Deliberate residuals for `/audit`: `dispatch` stays a single switch so the
  exhaustive `never` guard keeps working; `useLiveInterview` effects stay
  inline because the refs they share (`joinedRef`, `suspendingRef`,
  `pausedRef`, `startedAtRef`) are also written by the session callbacks, so
  moving effects into sub-hooks would rewire call sites for no behavior
  gain; `App` view branches stay inline to avoid prop-drilling churn.
  Verified: root `pnpm typecheck` clean; 41 targeted tests green
  (`recommendation`, `tool-service`, `docker-runner`, `evaluation` suites).
- Done when: each touched function is smaller or split by concern, the full
  suite (`pnpm typecheck`, `pnpm test`, `pnpm build`) is green, and any
  deliberately leftover residual is noted in the step result for `/audit`.

## Verify

- `pnpm typecheck`, `pnpm test`, `pnpm build` all green.
- Grep evidence per step: deleted names at zero, single dispatch site,
  single kind list, single configuration mapper, no divider lines.
- `/audit` re-reviews all 11 findings before `/complete`; it closes what the
  re-review confirms.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":6264,"specSha256":"621bfd7de453d9566e52ee309ce7b45e483a2580a376f1be421b6c37a8c88783","branch":"refs/heads/fix/audit-findings-f15-f25","head":"d574aa326af4c4c346a39d062afd49c511160ea7","baseRef":"origin/main","baseCommit":"c541ad118bed56648dc62575a1fab101b288e5d4","sourceTree":"d639e4db120bb93e81166ce6e94ed874a4e05e6c","absentOptional":[]} -->

## Findings

### audit-findings-f15-f25/F-15 [P2] closed - Dead design-system primitives exported from ds/primitives.tsx

**File:** packages/web-client/src/ds/primitives.tsx:33 (13 exports; also re-export at ~:413)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** Thirteen exported primitives have zero references outside their own definitions: `Eyebrow`, `SectionTitle`, `SectionHead`, `CtaCard`, `ProgressTrack`, `TableShell`, `CoachPanel`, `TimelineRow`, `Segmented`, `RadioCard`, `ProgressItem`, `StatCard`, `ScoreRow`; the `export { GhostButton, PrimaryButton }` re-export at ~:413 is also unused (consumers import from `ds/buttons.js`). This is the same class of dead surfacing as F-09 and weakens the claim that the design system is the shared source of truth.
**Suggested fix:** Delete the unreferenced primitives (and any types they alone use); keep only components that are actually mounted, or wire them up if they are intended for imminent screens.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `ds/primitives.tsx` rewritten keeping only mounted primitives (`Card`, `Badge`, `ChipList`, `VoiceRail`, `FormCard`, `Pill`, `Wave`, `Dialog`, `Field`); the 13 dead primitives and the unused button re-export deleted. Web-client typecheck clean, all dead names grep-zero. Independent re-review 2026-10-03 of target d574aa3: all 13 names plus the re-export grep zero under `packages/web-client/src`; only mounted primitives remain; `pnpm typecheck`, `pnpm build`, and the web-client suite (26 files / 234 tests, incl. render-smoke) green. No new defect introduced. Closed.

### audit-findings-f15-f25/F-16 [P2] closed - Function-call dispatch duplicated across five voice event handlers

**File:** packages/web-client/src/voice/voice-client.ts:429-571
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** The same "parse `call_id`/`name`, guard `isToolName`, `parseToolArgs`, assign `pendingCall`, call `executeTool`" block is repeated with slightly different fallbacks/metrics across `conversation.item.created` (429-447), `response.function_call_arguments.done` (490-506), `response.output_item.added` (507-524), `response.output_item.done` (525-536), and `response.done` (543-571). This is the exactly-once tool path, so a fix to dedup or argument handling must be applied five times or the handlers drift.
**Suggested fix:** Extract one private `handleFunctionCall(item, fallback?)` helper that all five cases call, keeping the per-event fallback choice as a parameter.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `handleFunctionCall(source, behavior)` added to `voice-client.ts`, preserving each site's exact fallback/metrics semantics; 4 dispatch sites routed through it and `handleServerEvent` is shorter. `response.done` deliberately still matches the pending call instead of parsing a new one (residual for audit re-review). Independent re-review 2026-10-03 of target d574aa3: diffed all four routed sites against the base revision - fallback resolution, `pendingCall` store/no-store choice, `whenArgsText`/`always`/`never` execute gate, previous-item-id source, and the `tool.requested` metric are each preserved exactly; `response.done` is intentionally untouched and still snapshot-matches the pending call. Web-client suite (26 files / 234 tests) green. No behavior change, no new defect. Closed.

### audit-findings-f15-f25/F-17 [P3] closed - Dead client API methods

**File:** packages/web-client/src/api/backend-client.ts:294 (getInterview), :374 (failInterview)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** `getInterview` and `failInterview` have no callers anywhere in the repo (the only other grep matches are the unrelated `getInterviewState`/`getInterviewConfiguration` in the domain tool service). Dead methods on the transport client mislead readers about the available API.
**Suggested fix:** Delete both methods, or add the caller that needs them.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `getInterview` and `failInterview` deleted from `api/backend-client.ts`; both names grep-zero repo-wide. Web-client typecheck clean. Independent re-review 2026-10-03 of target d574aa3: both names grep zero across `packages/`; `SerializedInterview` import still used by remaining methods; typecheck, build, and web-client suite green. Closed.

### audit-findings-f15-f25/F-18 [P3] closed - Dead `stale` state and misleading `DashboardView` wrapper

**File:** packages/web-client/src/App.tsx:116, :66-94 (also ResultsScreen.tsx:128-130)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** `stale` is set only to `false` (calls at 306/328/355/435), so it is always `false` and the "Scores below may be stale" branch in `ResultsScreen.tsx:128-130` is unreachable. Separately, `DashboardView` (66-94) is a pure prop-forwarding wrapper whose comment claims it mounts the data hook only while the dashboard is visible, but `useDashboard(...)` is called unconditionally at line 100. Dead state plus a dead abstraction with a false comment.
**Suggested fix:** Remove `stale` (state, prop, and unreachable branch) or actually set it when reopening history; render `DashboardScreen` directly and delete `DashboardView` and its comment.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `DashboardView` wrapper deleted (`App.tsx` renders `DashboardScreen` directly); `stale` state, its calls, and the prop removed; unreachable branch and stale prop removed from `ResultsScreen.tsx`. Web-client typecheck clean. Independent re-review 2026-10-03 of target d574aa3: `DashboardView` and the `stale` prop/state grep zero (remaining `stale` hits are prose adjectives in comments); `ResultsScreen` renders without the branch; typecheck, build, and web-client suite green. Closed.

### audit-findings-f15-f25/F-19 [P3] closed - `writeAssembledCpp` re-implements `rawCases`

**File:** packages/backend/src/docker-runner.ts:439-445 (vs rawCases at :582-594)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** `writeAssembledCpp` duplicates the `examples[i]?.input` lookup and the `missing sample input for case` throw from `rawCases`, so the pairing rule and error message live in two places and can diverge.
**Suggested fix:** Call `this.rawCases(testCases, context)` inside `writeAssembledCpp` instead of re-deriving the inputs.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `writeAssembledCpp` now calls `this.rawCases` (the local `CppSample` became structurally identical and its import was dropped). Backend typecheck clean, `docker-runner.test.ts` 15 green, and the full suite (1248 tests, incl. host-g++ cpp shape runs) passes. Independent re-review 2026-10-03 of target d574aa3: `writeAssembledCpp` calls `this.rawCases` (docker-runner.ts:434); the single lookup/throw pair lives in `rawCases` (:571-583) with the identical message; unused `CppSample` import dropped; `docker-runner.test.ts` 15 green and the full backend suite (29 files / 836 tests, incl. host-g++ shape runs) green. Closed.

### audit-findings-f15-f25/F-20 [P3] closed - Interview configuration mapped twice in repositories.ts

**File:** packages/db/src/repositories.ts:176-190 (vs :206-222)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** The interview `configuration` object is mapped once for insert values and again for the `onConflictDoUpdate` set, roughly 15 duplicated lines that must be kept in sync; adding a configuration field is a two-place edit with silent-drift risk.
**Suggested fix:** Extract a `toConfiguration(interview.configuration)` helper and spread it into both the insert values and the update set.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `toConfigurationColumn` helper added in `repositories.ts` and used by both the insert and the `onConflictDoUpdate` paths. Root typecheck clean, db tests 19 green. Independent re-review 2026-10-03 of target d574aa3: `toConfigurationColumn` (repositories.ts:105-117) is the single mapper, called at both the insert and conflict-update sites; field-for-field identical to the removed copies (including `topicFocus` spread-copy); root typecheck, build, and db suite (2 files / 19 tests) green. Closed.

### audit-findings-f15-f25/F-21 [P3] closed - Section-divider comment blocks violate the comment standard

**File:** packages/domain/src/recommendation.ts:195-197 (also :356-358; web-client/src/App.tsx:439,481,560,631,654)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** The coding standards forbid section dividers and banner-style comment blocks, but `recommendation.ts` has `// -----...-----` dividers and `App.tsx` has `// ---- Client URL routing ----` style markers. They add noise and drift from the code they label.
**Suggested fix:** Delete the divider lines; keep an adjacent one-line rationale only where the "why" is not obvious.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `recommendation.ts` dividers collapsed to one-liners; the 5 `App.tsx` marker lines deleted (rationale kept). Root typecheck clean. Independent re-review 2026-10-03 of target d574aa3: `----` greps zero in `recommendation.ts` and in `App.tsx` (remaining matches are pre-existing CSS section comments in `styles.css`, outside this finding's scope); no rationale comment was lost; typecheck and domain suite (21 files / 158 tests) green. Closed.

### audit-findings-f15-f25/F-22 [P2] closed - Functions still far over the 50-line guideline

**File:** packages/web-client/src/voice/voice-client.ts:401-590 (handleServerEvent, ~190 lines)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** Several functions remain well over the standards' "under 50 lines when possible" bar: `handleServerEvent` voice-client.ts:401-590 (~190), `useLiveInterview` use-interview.ts:93-501 (~400), `App` App.tsx:96-765, `runJob` backend/evaluation.ts:134-240 (~107), `buildRecommendationCandidates` domain/recommendation.ts:248-354 (~107), `runContainer`/`parseHarnessOutput` docker-runner.ts:596-680/682-776, and `dispatch` domain/tool-service.ts:287-357. The F-12 extraction addressed the app.ts route handlers; these are the next-largest offenders.
**Suggested fix:** Extract per-concern helpers (harness-output parsing, poll/timer effects, event-handler branches) starting with `handleServerEvent`, which F-16 already partly addresses.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `handleServerEvent` shortened via the F-16 `handleFunctionCall` helper; `parseHarnessOutput` split into `parseSingleJsonProtocol` + `parseJsonLinesProtocol`; `runJob` split into `loadOrRecordEvaluation` + `finishJob` + `failJob`; `buildRecommendationCandidates` gained a `CandidateCollector` helper. Deliberate residuals: `dispatch` stays a single switch (keeps the exhaustive `never` guard), `useLiveInterview` effects stay inline (shared refs also written by session callbacks), `App` view branches stay inline (avoids prop-drilling churn). Targeted suites green (41 tests). Independent re-review 2026-10-03 of target d574aa3: `parseSingleJsonProtocol`/`parseJsonLinesProtocol` are verbatim moves of the original branches (same skip-verdict-collision comment); `loadOrRecordEvaluation`/`finishJob`/`failJob` preserve the claim/record/skill-update/regenerate/fail-exhaustion flow including the `startedAt ?? claimedAt` fallback; `CandidateCollector.add`/`finish` preserve the five priority phases, seen-problem dedup, and the `Math.min(MAX, Math.max(1, floor(limit ?? MAX)))` cap. Deliberate residuals accepted under the standard's "when possible" with the recorded rationale. Full backend (836), domain (158), and web-client (234) suites green. Closed.

### audit-findings-f15-f25/F-23 [P3] closed - Redundant `users_email_idx` duplicates the unique index

**File:** packages/db/src/schema.ts:30 (with :27)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** `email: text("email").unique()` already creates a unique btree on `users.email`, and `index("users_email_idx").on(t.email)` adds a second btree on the same column (migration 0002 creates both). The redundant index costs writes and storage for no query benefit; `findByEmail` can use the unique index.
**Suggested fix:** Drop `users_email_idx` (add a migration) and keep the unique constraint.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `users_email_idx` dropped from `schema.ts`; new migration `drizzle/0012_aspiring_butterfly.sql` contains only the `DROP INDEX`. Root typecheck clean, db tests 19 green. Independent re-review 2026-10-03 of target d574aa3: `schema.ts` keeps `email.unique()` with no secondary index; migration 0012 (plus journal/snapshot entries) contains only `DROP INDEX "users_email_idx"` per the repo `drizzle-kit generate` rule; migration 0002 still creates the index first so 0012 applies cleanly on migrated DBs; db suite (2 files / 19 tests) green. Closed.

### audit-findings-f15-f25/F-24 [P3] closed - Same-line declaration formatting artifacts from mechanical edits

**File:** packages/backend/src/docker-runner.ts:826 (also repositories.ts:1406, CodeWorkspace.tsx:324, serializers.ts:370, App.tsx:274-277)
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** Several declarations or statement bodies ended up on the same line as an opening brace, e.g. `docker-runner.ts:826` `function capActual(actual: unknown, max: number): unknown {  let serialized: string;`, plus `repositories.ts:1406`, `CodeWorkspace.tsx:324`, `serializers.ts:370`, and a mis-indented body inside `App.tsx` `startRecommended` (274-277). Syntax is valid but the inconsistent formatting degrades readability.
**Suggested fix:** Split the statements/declarations onto their own lines (a formatter pass would fix all of these).
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `capActual` line split, `repositories.ts:1406` comment split, `CodeWorkspace.tsx:324` and `serializers.ts:370` split; `App.tsx:274-277` was already clean. Root typecheck clean. Independent re-review 2026-10-03 of target d574aa3: all four split sites confirmed on their own lines; no same-line `{` + statement artifacts remain at the listed sites; typecheck and build clean. Closed.

### audit-findings-f15-f25/F-25 [P3] closed - `RESPONSE_KINDS` restates the `ResponseKind` union

**File:** packages/domain/src/tool-service.ts:262-268
**Found:** 2026-09-29 by /audit (scope: full; lens: quality)
**Why it matters:** The runtime `RESPONSE_KINDS` list re-lists the `ResponseKind` union defined in `candidate-response.ts:9`, creating a second source of truth; adding a kind requires editing both and the lists can silently drift.
**Suggested fix:** Export a single `RESPONSE_KINDS` constant tuple from `candidate-response.ts` and derive the `ResponseKind` type from it, then reuse that constant here.
**Resolution:** Fixed on `fix/audit-findings-f15-f25`: `RESPONSE_KINDS` const tuple added to `candidate-response.ts` with `ResponseKind` derived from it; `tool-service.ts` reuses it (local list deleted) and `app.ts` uses `z.enum(RESPONSE_KINDS)` (local tuple deleted). Root typecheck clean, 46 domain tests green. Independent re-review 2026-10-03 of target d574aa3: `RESPONSE_KINDS` tuple owns the list (candidate-response.ts:11), `ResponseKind` derives from it (:12), `tool-service.ts` imports and uses it (:11, :566) with the local list deleted, and `app.ts` uses `z.enum(RESPONSE_KINDS)` (:190) with `RESPONSE_KINDS_TUPLE` deleted; same five kinds, no contract change; typecheck, build, domain (158) and backend (836) suites green. Closed.

## Independent review

# Independent Review

**Status:** passed
**Target commit:** d574aa326af4c4c346a39d062afd49c511160ea7
**Base commit:** c541ad118bed56648dc62575a1fab101b288e5d4
**Base ref:** origin/main
**Spec hash:** 621bfd7de453d9566e52ee309ce7b45e483a2580a376f1be421b6c37a8c88783
**Prepared by:** opencode
**Builder model:** opencode/muse-spark-1.3-contributor-free
**Requested reviewer:** opencode
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-03T11:51:23Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** opencode
**Reviewer model:** opencode/muse-spark-1.3-contributor-free
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-03T11:58:42Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `pnpm typecheck`: pass (clean, no output)
- `pnpm build`: pass (`tsc -b` clean)
- backend vitest suite (29 files / 836 tests, incl. docker-runner 15, evaluation 7, host-g++ cpp shape runs): pass
- domain vitest suite (21 files / 158 tests, incl. recommendation/tool-service coverage): pass
- web-client vitest suite (26 files / 234 tests, incl. render-smoke em-dash guard and voice-args): pass
- db vitest suite (2 files / 19 tests, incl. persistence round-trip): pass

## Evidence

- `HEAD` equals `Target commit` d574aa3; `git merge-base origin/main HEAD` equals `Base commit` c541ad1; `sha256sum blueprint/context/current-feature.md` equals recorded `Spec hash`; `git status` shows no path differing from target except `blueprint/context/review.md` (this receipt).
- Reviewed the full `c541ad1..d574aa3` delta fresh (single commit `fix: repair audit findings F-15 through F-25`) plus the spec; excluded only `review.md`/`findings.md`; existing findings used as context, never as the checklist.
- F-16 equivalence: diffed all four routed voice dispatch sites against the base revision - per-site fallback resolution, `pendingCall` store/no-store, `whenArgsText`/`always`/`never` execute gate, previous-item-id source, and the `tool.requested` metric are preserved exactly; `response.done` untouched.
- F-22 equivalence: `parseSingleJsonProtocol`/`parseJsonLinesProtocol`, `loadOrRecordEvaluation`/`finishJob`/`failJob`, and `CandidateCollector` are verbatim moves preserving branch order, error messages, idempotency guards, and the candidate cap formula.
- Deletion checks: the 13 F-15 primitive names, `getInterview`/`failInterview`, `stale` state/`DashboardView`, and `RESPONSE_KINDS_TUPLE` grep zero; `----` dividers grep zero in `recommendation.ts` and `App.tsx`; em/en dashes and ellipsis grep zero under `packages/` except the intentional render-smoke guard assertion.
- Security: no auth/ownership, input-validation, sandbox-flag, secret-handling, or dependency change in the delta; `z.enum(RESPONSE_KINDS)` carries the same five kinds.
- Performance: extractions add a single call frame with identical iteration counts; no new query, network, render, payload, or concurrency surface.

## Findings

- F-15 [P2] closed, F-16 [P2] closed, F-17 [P3] closed, F-18 [P3] closed, F-19 [P3] closed, F-20 [P3] closed, F-21 [P3] closed, F-22 [P2] closed, F-23 [P3] closed, F-24 [P3] closed, F-25 [P3] closed - all 11 re-examined against the target delta and moved from `fixed` to `closed` with re-review evidence in the ledger.
- No new findings: the fresh four-lens pass over the complete delta found no P0/P1/P2/P3 defect; pre-existing conditional test skips (`skipIf` on missing dataset/seed/Docker) are untouched by this delta.

## Remaining risk

- F-22 deliberate residuals remain over the 50-line guideline by design (`dispatch` single switch keeps the exhaustive `never` guard; `useLiveInterview` effects share refs with session callbacks; `App` view branches avoid prop-drilling churn) - accepted under the standard's "when possible", no action required.
- `response.done` deliberately still snapshot-matches the pending call instead of parsing a new one (F-16 residual) - matches pre-existing behavior, no action required.
- No verification command was unavailable: typecheck, all four package test suites, and build ran in this session; Check was not required for this receipt.
