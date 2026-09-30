# Fix: Remove em dashes from packages source

**Type:** Fix
**Status:** verified
**Branch:** fix/remove-em-dashes
**Fixes:** F-14

## The problem

F-14 (`blueprint/context/findings.md`): the Writing standard
(`blueprint/context/coding-standards.md`) bans em dashes (U+2014) in generated
content, but 194 of them sit in 104 files under `packages/` (code comments,
user-facing copy, test strings). Examples: `packages/backend/src/app.ts:1`,
`packages/backend/src/auth.ts:1`, `packages/web-client/src/components/CodeWorkspace.tsx:459,466,510,513,536`,
`packages/web-client/src/screens/LobbyScreen.tsx:209`. Same sweep also clears
the 3 en dashes (U+2013) and 45 ellipsis characters (U+2026) in `packages/`,
which the same standard tells us to avoid.

F-13 (named in the request) is already `fixed` on
`fix/app-header-and-handler-extraction` and needs no work here.

Out of scope (user-confirmed): `docs/` and `blueprint/history/` keep their
dashes verbatim as immutable history/operator logs (F-01 precedent). The
deliberate empty-value placeholder glyphs (`HistoryScreen.tsx:139`,
`CodeWorkspace.tsx:68,122,128`) are replaced with a plain hyphen per the
user's call.

## The fix

Mechanical character replacement across `packages/` only, no behavior change
except visible glyph swaps (`—` to `-` in rendered cells and copy):

- ` — ` (spaced em dash) becomes ` - ` per the standard's
  `term - description` separator rule; where a bare hyphen reads badly,
  rephrase with a comma, colon, or parentheses instead.
- `"—"` placeholder cells become `"-"`.
- En dash becomes `-`; ellipsis character becomes `...`.
- Must not break: the `render-smoke` assertion that HistoryScreen HTML
  contains no `—` (it should now pass with margin), snapshot-adjacent test
  strings, and any string literal matched by tests.

## Build steps

1. Backend + routes (`packages/backend/`): replace all three characters per
   the rules above. Done when `python3` count of U+2014/U+2013/U+2026 in
   `packages/backend/` is zero and `pnpm --filter @interview-coach/backend`
   typecheck passes.
2. Domain + db (`packages/domain/`, `packages/db/`): same replacement. Done
   when the count in both dirs is zero and both package typechecks pass.
3. Web client (`packages/web-client/`): same replacement, including the
   placeholder cells and user-facing copy. Done when the count is zero and
   the web-client typecheck passes.
4. Full verification (see Verify). Done when counts are zero repo-wide under
   `packages/` and every gate below is green.

## Verify

- Character census returns zero: U+2014, U+2013, U+2026 under `packages/`,
  with one intentional exception: `render-smoke.test.tsx:352` asserts rendered
  HistoryScreen HTML contains no U+2014, so the assertion literal itself must
  name the character.
- `pnpm typecheck`, `pnpm test` (full suite, was 1248/1248), `pnpm build`.
- Spot-check rendered HistoryScreen and CodeWorkspace: no `—` in output,
  hyphen placeholders present.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2978,"specSha256":"4fef6afba39db85171f40dded57711ad5d479a3c2b667053194cba5608368780","branch":"refs/heads/fix/remove-em-dashes","head":"2723792baa37e483db280765595202884c59e76d","baseRef":"refs/heads/main","baseCommit":"2723792baa37e483db280765595202884c59e76d","sourceTree":"89f4d4b0dc343e2b55c61ce4cdc937309aede391","absentOptional":[]} -->
