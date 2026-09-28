# Fix: Reset learning state in Settings

**Type:** Fix
**Status:** verified
**Branch:** `fix/reset-learning-state-in-settings`

## The problem

Settings → "Delete interviews" hard-deletes interview rows (plus
interview-scoped artefacts), but the dashboard hero keeps showing the old
card (e.g. *"You have 27 failed attempts on arrays…"*). That text is the
persisted `recommendations.reason` rendered verbatim, and the surrounding
progress sections derive from `user_skill_states` / curriculum progress —
none of which interview deletion touches. There is currently no way for a
user to get a clean learning slate. User decision: add a separate
**"Reset learning state"** button; keep "Delete interviews" exactly as-is.

## The fix

- New backend `DELETE /api/learning-state`: resolves the owner from the
  session (never the body, same as the recommendations routes) and deletes
  the caller's rows in `recommendations`, `user_skill_states`, and
  `user_curriculum_progress` (all curricula for that user). Returns deleted
  counts. Keeps: profile, interviews/history, problem catalog, account,
  sessions. 401 when signed out.
- Domain: add `deleteByUser(userId): Promise<number>` to
  `RecommendationRepository`, `UserSkillStateRepository`, and
  `UserCurriculumProgressRepository` (`domain/src/repositories.ts`), with
  InMemory + Drizzle implementations. No migration (delete-only, no schema
  change).
- Client: `BackendClient.resetLearningState()`; Settings "Privacy & data"
  section gains a "Reset learning state" `DangerButton` + confirm `Dialog`
  mirroring the existing Delete-interviews pattern (busy label, error line);
  App.tsx wires the handler; after success the dashboard data reloads. The
  dashboard's existing `getCurrentRecommendation() ?? createRecommendation()`
  path auto-creates a fresh recommendation on next load — no new flow.
- Must not break: Delete interviews flow and copy unchanged, dashboard
  auto-create path, per-user auth scoping, catalog/profile rows untouched.

## Build steps

- [x] 1. Domain + persistence: `deleteByUser` on the three repo interfaces,
  InMemory implementations, and Drizzle implementations, with unit tests.
  Done when new targeted tests pass and `pnpm typecheck` is clean.
- [x] 2. Backend route: `DELETE /api/learning-state` (session owner,
  counts response, 401 signed-out), wired in `app.ts` with route tests.
  Done when the route suite covers success-shape, empty-state, and 401.
- [x] 3. Client + Settings UI: `resetLearningState()` client method,
  Settings button + confirm dialog + busy/error states, App.tsx wiring and
  dashboard reload. Done when manual try shows the reset flow end to end
  with Delete interviews untouched.

## Verify

- `pnpm typecheck`, focused + full `pnpm test`, web-client build.
- Manual: build up attempts → Delete interviews (dashboard card stays:
  unchanged behavior) → Reset learning state → dashboard shows a fresh
  recommendation and empty progress; History screen unaffected.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3000,"specSha256":"68e6bd8f70cb513f5af3e5a8fe10cb5d0e2f3286a2de56d517d32e8f9c5fb4bb","branch":"refs/heads/fix/reset-learning-state-in-settings","head":"9fca9acf22d8cc59b6712b1fd97a27b363a9699a","baseRef":"refs/heads/main","baseCommit":"9fca9acf22d8cc59b6712b1fd97a27b363a9699a","sourceTree":"5f9da2acfad00af698922d44375b1a76972b3ad2","absentOptional":[]} -->

## Completion record

Reset learning state shipped on branch fix/reset-learning-state-in-settings.

- Backend DELETE /api/learning-state (session-owner scoped, 401 signed out, counts response, learning-state.reset audit log).
- deleteByUser(userId) on Recommendation, UserSkillState, and UserCurriculumProgress repos (InMemory + Drizzle, .returning() counts, no migration).
- Client BackendClient.resetLearningState(); Settings Privacy & data Reset learning state DangerButton + confirm Dialog; App.tsx resettingAll wiring + dashboard reload (auto-creates a fresh recommendation).
- Delete interviews flow and copy unchanged; profile, interviews, catalog, account untouched.
- Gates: pnpm typecheck 0, focused suites 3/3 + 4/4, full pnpm test 77 files / 1218 green, web-client 8GB build ok.
- Live manual try (Settings reset end to end) pending user try.
