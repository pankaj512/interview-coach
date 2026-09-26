# Fix: Editor language memory

- **Type:** Fix
- **Status:** verified
- **Branch:** `fix/editor-language-memory`

## The problem

The interview editor always opens in Python even when the candidate used a
different language last time. `CodeWorkspace` hardcodes its initial state
(`packages/web-client/src/components/CodeWorkspace.tsx:91`,
`useState<CodeLanguage>("python")`), and nothing persists the selector choice,
so every new interview resets to Python. The language set is closed
(`CodeLanguage = "javascript" | "python" | "cpp"`,
`packages/web-client/src/api/types.ts:275`).

## The fix

Remember the candidate's editor language on this browser and use it as the
initial language, following the established `voice-prefs.ts` pattern
(safe `globalThis.localStorage` access, allowlist validation, never throws):

- New `packages/web-client/src/components/editor-prefs.ts` with
  `loadEditorLanguage(): CodeLanguage | null` (unknown/empty stored values
  read back as null) and `saveEditorLanguage(language: CodeLanguage): void`,
  under a dedicated key (e.g. `ic.editor-language`).
- `CodeWorkspace` initializes its language state from the loader (lazy
  `useState` initializer; Python stays the default when nothing valid is
  stored) and saves on every selector change.
- Must not break: starter prefill/refill while untouched, Monaco model-language
  sync, the `get_candidate_code` reader (reads `languageRef`, unchanged), or
  Test submission. No backend change; the preference never leaves the client.

## Build steps

1. Add `editor-prefs.ts` plus unit tests mirroring
   `tests/voice-prefs.test.ts` (valid round-trip per language, unknown/empty
   reads back null, storage failure never throws), then wire load/save into
   `CodeWorkspace`. [x]
   - Done when: new tests pass; changing the selector persists the value and
     a fresh mount starts in the stored language (covered by a component-level
     or prefs-level test where the node/vitest environment allows).

## Verify

- `pnpm typecheck` clean; full `pnpm test` green.
- Manual: open an interview, switch the editor to C++, start a new interview
  (or reload) → the editor opens in C++ with its starter; clearing site data
  restores the Python default.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2229,"specSha256":"9b94ce317bd3288e50f4940614c02eaf83c0ff9cbbb46208c9abf41a94a19f01","branch":"refs/heads/fix/editor-language-memory","head":"0ffac5015c0241e53752ac6fcabbf98001cfd684","baseRef":"refs/heads/main","baseCommit":"0ffac5015c0241e53752ac6fcabbf98001cfd684","sourceTree":"5ad7f2ad4a503aa045731f4cb1f9099abb5f32e2","absentOptional":[]} -->
## Completion record

Work branch `fix/editor-language-memory` (base `main@0ffac50`, no prior archive at this path). The interview editor remembers the candidate's language on this browser:

- `packages/web-client/src/components/editor-prefs.ts` (new): `loadEditorLanguage(): CodeLanguage | null` and `saveEditorLanguage(language: CodeLanguage): void` under `ic.editor-language`, mirroring `voice/voice-prefs.ts` (safe `globalThis.localStorage` access, closed-set validation against `javascript | python | cpp`, never throws; Python stays the default via `DEFAULT_EDITOR_LANGUAGE`).
- `packages/web-client/src/components/CodeWorkspace.tsx`: language state initialized lazily from the loader; selector change saves. Starter prefill/refill, Monaco model-language sync, the `get_candidate_code` reader, and Test submission all read the same state and follow unchanged. No backend change; the preference never leaves the client.
- `packages/web-client/tests/editor-prefs.test.ts` (new, 6 tests): closed set + default, null-on-empty, stored round-trip, unknown/empty rejection, out-of-set save ignored.

Final gates (this session, after all product changes): `pnpm typecheck` clean, full `pnpm test` 70 files / 1160 tests green, web-client `vite build` succeeds (`NODE_OPTIONS=--max-old-space-size=8192`).

Live-try note: the first user try appeared to fail (new interview still Python) but the browser was running a stale pre-fix bundle; after a dev-server restart the user confirmed `ic.editor-language` persists and fresh interviews open in the stored language.

No findings resolved by this fix; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review requested or required (regular gates: audit/check/tryGuide manual, independentReview when-sensitive; judged non-sensitive: client-only UI preference, no new endpoint, secret, or trust boundary).
