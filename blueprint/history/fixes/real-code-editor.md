# Fix: Real code editor

**Type:** Fix
**Status:** verified
**Branch:** `fix/real-code-editor`

## The problem

The interview code editor is a plain `<textarea>`
(`packages/web-client/src/components/CodeWorkspace.tsx`, line 120): Tab moves
focus instead of indenting, no auto-closing brackets, no auto-indent, no
completion, no syntax highlighting. The client has only `react`/`react-dom`
as runtime dependencies, so no editor library is available.

## The fix

Replace the textarea with a self-hosted Monaco editor (new runtime dependency:
`monaco-editor`, created directly per the official `browser-esm-vite-react`
sample, plus a small Vite worker setup module) for the three interview languages
(python/javascript/cpp): syntax highlighting, Tab-to-indent, auto-close
brackets, auto-indent, and word-based suggestions. Keep the current contract
intact: verbatim-starter prefill, dirty-guard (never clobber edits, refill on
problem/language change while untouched), a loading fallback while Monaco
loads, and the unchanged Test submission path. No other component changes.

## Build steps

- [x] 1. Editor dependency + CodeWorkspace swap — remove the unused CodeMirror
  packages, add the Monaco package + worker setup, replace the textarea,
  wire language/theme + starter value + dirty guard. Done when typecheck is
  green and existing CodeWorkspace tests pass (updated where they target
  textarea behavior).
- [x] 2. Manual try proof — open an interview problem and confirm Tab
  indents, brackets auto-close, highlighting/completion active per language,
  and prefill still fills untouched editors only. Done when the try path is
  recorded. (Passed 2026-09-25: user-confirmed in a live interview with
  C++ highlighting visible; Tab, auto-close, completion, prefill per report.)

## Verify

- `pnpm typecheck` clean; full `pnpm test` green.
- Manual: Tab, auto-close, highlighting, completion in all three languages.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":1929,"specSha256":"3e57d980f9669029855558594dc75c4952dad7c3903d475fcb7aaf76b1d36d68","branch":"refs/heads/fix/real-code-editor","head":"c5b57ad32f29076846c7a35abc2476c7f5a31ade","baseRef":"refs/heads/main","baseCommit":"c5b57ad32f29076846c7a35abc2476c7f5a31ade","sourceTree":"97969161a0c5026b7e9f4c853b0d34ab8e83951e","absentOptional":[]} -->

## Completion record

Work branch `fix/real-code-editor` (base `main@c5b57ad`). One new runtime
dependency (`monaco-editor@0.57.0`); no CodeMirror packages existed to remove:

- `packages/web-client/package.json` (+ `pnpm-lock.yaml`, pnpm
  `minimumReleaseAgeExclude` supply-chain entry): adds `monaco-editor`.
  `@monaco-editor/react` was tried and dropped — its types do not satisfy
  React 19 JSX; the editor is created directly per the official
  `browser-esm-vite-react` sample.
- `packages/web-client/src/components/monaco-setup.ts` (new): self-hosted
  Vite worker setup (editor/json/css/html/ts workers, no CDN), dynamically
  imported client-only so unit tests never load Monaco. Workers use explicit
  relative paths because the package `exports` map hides `esm/vs/*` from
  bundler resolution.
- `packages/web-client/src/components/CodeWorkspace.tsx`: textarea replaced
  with `monaco.editor.create` — python/javascript/cpp languages, `vs-dark`,
  Tab-to-indent, auto-close brackets, full auto-indent, tab completion,
  word-based suggestions, loading fallback, verbatim-starter prefill +
  dirty guard (suppressed programmatic pushes, refill while untouched,
  `setModelLanguage` on switch). Test submission path unchanged.
- `packages/web-client/src/styles.css`: `.code-editor` container (border,
  radius, 320px height). `vite.config.ts` unchanged (alias attempt reverted).

Final gates (this session): `pnpm typecheck` clean, web-client `vite build`
succeeds (Monaco lazy-split, all 5 workers emitted; needs
`NODE_OPTIONS=--max-old-space-size=8192`), `pnpm test` 68 files / 1125 tests
green, focused `code-workspace.test.ts` 5/5. Manual try passed 2026-09-25:
user-confirmed Tab/auto-close/highlighting/completion/prefill in a live
interview (C++ highlighting visible in screenshot).

No findings resolved by this fix; F-01–F-04 [P2/P3] fixed plus F-05 [P2] open
plus F-06/F-07 [P3] open stay verbatim in the ledger. No independent review
requested or required (all regular gates manual; client-editor change, no new
trust boundary).
