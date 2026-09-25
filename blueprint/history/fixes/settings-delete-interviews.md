# Fix: Settings delete interviews

**Type:** Fix
**Status:** verified
**Branch:** `fix/settings-delete-interviews`

## The problem

The Settings → Privacy & data row labeled "Interview history" has a
"Reload interviews" button (`packages/web-client/src/screens/SettingsScreen.tsx:88-91`)
that only refetches the list (`App.tsx:574` wires `onHistoryCleared` to
`refreshHistory()`). It deletes nothing, so "delete should work" fails, and
the label promises a reload the user did not ask for. There is no way to
clear all history from Settings, and no confirm step anywhere near it.

Follow-up from live try (user screenshot 2026-09-25): History per-item
Delete on a live (`in_progress`/`paused`) interview fails with a raw backend
error (`Could not delete iv_…: ILLEGAL_TRANSITION: Cannot delete interview
iv_… while in_progress; end, cancel, or fail it first`). Two defects: the
domain guard (`packages/domain/src/interview-service.ts:217`) refuses live
interviews and the client has the cancel transition (`cancelInterview`) but
no UI calls it, so stuck live rows are undeletable; and the raw error leaks
the interview id plus a backend code. Yes — Delete does hard-erase from the
DB (row plus cascade artefacts) whenever the guard lets it through.

## The fix

Turn the row into a real, confirmed delete-all, reusing existing machinery
only (no new endpoint, no new dependency):

- Relabel the button "Delete interviews" and render it as a `DangerButton`
  (`packages/web-client/src/ds/buttons.js`, same as End interview), disabled
  while history is empty or a delete is in flight.
- Add warning copy on the row: deleting clears the interview history
  permanently (scores/feedback/progress derived from it go with it).
- Gate behind the existing `Dialog` (`packages/web-client/src/ds/primitives.js`,
  same confirm pattern as LiveScreen's End-interview dialog) with explicit
  Delete / Keep actions. Closing the dialog deletes nothing.
- On confirm, App loops the existing per-item `backend.deleteInterview(id)`
  over all entries (same hard-delete endpoint History's per-item delete uses),
  then refreshes history. Failures surface through the existing Settings
  `.error[role=alert]` pattern and a refresh still runs so the list shows its
  true state.
- Must not break: Export JSON, per-item History delete (`deleteEntry`), voice
  wiring, auth flows, token-driven styling (no inline styles).

Follow-up (same branch):

- Cancel-then-delete for live rows: both delete paths route through one
  `history.ts` helper that cancels (`cancelInterview`, reason recorded) when
  the entry is `in_progress`/`paused`, then hard-deletes. All other statuses
  delete directly (the guard only refuses those two).
- Friendly delete errors: both paths show curated copy with no ids and no
  backend codes ("Could not delete this interview." /
  "Could not delete all interviews. … were deleted."). `formatApiError`
  stays as-is everywhere else.

## Build steps

- [x] 1. Confirmed delete-all from Settings — relabel + `DangerButton` +
  warning copy + `Dialog` confirm in `SettingsScreen`, delete-all loop +
  refresh in `App`, error surfacing on failure. Done when typecheck is green,
  focused tests pass (confirm-open/delete-call/empty-disabled behavior at the
  purest seam available), and a live try shows: Delete interviews opens the
  confirm, Keep deletes nothing, Delete empties History, and a failed delete
  shows an error with the list refreshed. (Code + automated checks green
  2026-09-25: typecheck clean, `deleteAllInterviews` unit tests 3/3,
  render-smoke updated to the new label; failures route through App's
  existing `historyError` path like per-item delete; live try pending user.)
- [x] 2. Cancel-then-delete for live interviews — one `history.ts` helper
  cancels live (`in_progress`/`paused`) entries before hard-delete; both
  delete paths use it and show curated errors with no ids or backend codes.
  Done when typecheck is green, focused unit tests pass (live entry is
  cancelled then deleted; settled entry deletes directly; failure surfaces
  the curated copy), and a live try deletes the stuck in-progress row with
  no raw error. (Code + automated checks green 2026-09-25: typecheck clean,
  `history.test.ts` 6/6 incl. skip-set paging; live try pending user.)

## Verify

- `pnpm typecheck` clean; full `pnpm test` green.
- Manual: Settings → Privacy & data → Delete interviews → confirm dialog
  warns history is cleared permanently → Delete empties History (dashboard,
  history, progress reflect it) → Keep/cancel changes nothing.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4588,"specSha256":"9eda197038e2defaf0f1b461f8f70412256e06644b42617f8864d9776ec452f3","branch":"refs/heads/fix/settings-delete-interviews","head":"64270e79c85c3deb7a30772209527448e7aa7667","baseRef":"refs/heads/main","baseCommit":"64270e79c85c3deb7a30772209527448e7aa7667","sourceTree":"cadcba05110658161f02d1c91edf9e03282baf7c","absentOptional":[]} -->
## Completion record

Work branch `fix/settings-delete-interviews` (base `main@64270e7`, no prior archive at this path). Settings delete-all plus live-row cancel-then-delete:

- `packages/web-client/src/screens/SettingsScreen.tsx`: "Reload interviews" `GhostButton` replaced with red "Delete interviews" `DangerButton` (disabled when history is empty or a delete is in flight, "Deleting…"); inline warning hint on the row; confirm `Dialog` ("Delete all interviews?" with Keep/Delete actions and permanent-loss warning, same pattern as End interview). Closing the dialog deletes nothing. New props `deletingAll`/`onDeleteAll` replace `onHistoryCleared`.
- `packages/web-client/src/history.ts`: new `deleteHistoryEntry(client, id, status)` — cancels (`cancelInterview`, reason "Deleted from history") when the entry is `in_progress`/`paused`, then hard-deletes; all other statuses delete directly (the domain guard only refuses those two). `deleteAllInterviews` pages through the capped list via the helper and returns `{deleted, failed}`, skipping stuck rows on later pages so one failure cannot block the rest or loop forever.
- `packages/web-client/src/App.tsx`: per-item `deleteEntry` and Settings `deleteAllHistory` both route through the helper; errors are curated copy with no ids or backend codes ("Could not delete this interview. Your history was refreshed." / "Could not delete all interviews. N deleted; …"), recorded after the refresh so `refreshHistory` error-clear cannot wipe them. Export JSON, voice wiring, auth flows untouched; no inline styles.
- `packages/web-client/tests/history.test.ts` (new, 6 tests): live/paused entries cancelled then deleted, settled entry direct, multi-page delete-all with live cancel, empty no-op, stuck-row skip with `{deleted: 1, failed: true}`. `tests/render-smoke.test.tsx` updated to the new label (asserts "Delete interviews", rejects "Reload interviews").

Final gates (this session, after all product changes): `pnpm typecheck` clean, full `pnpm test` 69 files / 1136 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`); focused history + render-smoke 35/35. Manual live try (confirm Keep/Delete, stuck-row delete with no raw error, delete-all) is documented in the spec Verify section and left to the user.

No findings resolved by this fix; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive — user-confirmed deletion of the user's own interviews through the pre-existing hard-delete, client-only, no new endpoint or trust boundary).
