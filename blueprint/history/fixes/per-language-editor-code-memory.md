# Fix: Per-language editor code memory

**Type:** Fix
**Status:** verified
**Branch:** `fix/per-language-editor-code-memory`

## The problem

Switching the editor language mid-interview keeps the old language's code: type C++, Test it, switch to Python — the selector changes but the C++ code stays. Root cause in `CodeWorkspace.tsx`: the language `<select>` only sets `language` state, while code lives in a single `code` state; the only code-swap path is the starter-prefill effect, which returns early once `dirtyRef` is true (i.e. after the first keystroke). So after any edit, no language switch ever loads that language's code.

## The fix

Keep one saved buffer per language (in the component, seeded from starters — no new dependency, no storage migration):

- Seed: when `starters` arrive, fill `savedRef` for every language that has a starter and no user-saved buffer yet. Never overwrite a buffer the candidate already saved by switching.
- Switch (`changeLanguage`, wired to the existing `<select>`): save `codeRef.current` under the outgoing language, then load `saved[next] ?? starter(next) ?? ""` through the existing `pushValue` (so `suppressRef` keeps the swap from marking edits, and `dirtyRef` is left untouched). Model language sync stays as-is.
- The existing `codeReaderRef`/`languageRef` pair keeps feeding `get_candidate_code` the post-switch values with no change.
- Run/verdict panels stay untouched on switch (same as today; results are per-submission history, not per-language state). Must not break: starter prefill for untouched editors, never-clobber of candidate edits, Test/Submit flows, editor-prefs language persistence.

## Build steps

- [x] 1. Per-language buffers + `changeLanguage` in `CodeWorkspace.tsx`, with a pure `switchLanguageCode(saved, starters, from, to, currentCode)` helper covered by unit tests in `code-workspace.test.ts` (save-outgoing, restore-saved, fresh-starter fallback, empty fallback).
  Done when switching C++ → Python → C++ preserves each side's code, and `pnpm typecheck`, the client suite, and the web-client build pass.

## Verify

- `pnpm typecheck`, client `code-workspace.test.ts`, web-client build.
- Manual room try: pick C++, type code, switch to Python (starter appears), type Python, switch back (C++ code restored), switch to Python again (typed Python code restored).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2354,"specSha256":"788407dec6b171d84e1254a75a977fc5eb9bbb2628d0456cde247b32a80a130d","branch":"refs/heads/fix/per-language-editor-code-memory","head":"d04946451e78b455fad3b8df72bc2408d6cc74e6","baseRef":"refs/heads/main","baseCommit":"d04946451e78b455fad3b8df72bc2408d6cc74e6","sourceTree":"264fd5bded651453e24d4988bdba104d43d18a58","absentOptional":[]} -->

## Completion record

- Landed per-language editor buffers in `CodeWorkspace.tsx`: pure `switchLanguageCode(saved, starters, from, to, currentCode)` (stash outgoing, restore saved, else starter, else empty; same-language no-op), `savedCodeRef` seeded from all three starters on arrival (never overwriting a user-saved buffer) and reset on problem change, plus `changeLanguage` wired to the selector via the existing `pushValue` path (no false edit marks, `dirtyRef` untouched). Model-language sync, `get_candidate_code` reader, editor-prefs persistence, and Test/Submit flows unchanged; run/verdict panels stay put on switch per explicit user scope.
- Tests: 4 `switchLanguageCode` cases in `code-workspace.test.ts` (stash + restore, starter fallback, empty fallback, same-language no-op).
- Gates: `pnpm typecheck` clean, focused 38/38, full `pnpm test` 77 files/1244 green, 8GB vite build ok.
- Live proof pending user room try: C++ -> Python -> C++ round-trip preserving each side.
- Findings/review: nothing resolved, no review — ledger (F-01..F-04 fixed P2/P3, F-05 P2 + F-06/F-07 P3 open, no P0/P1) and review stub left intact.
