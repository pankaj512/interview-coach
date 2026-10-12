# Fix: problem statement renders as an unformatted text wall

- **Date:** 2026-10-12
- **Branch:** `fix/problem-statement-formatting`
- **Base:** `3aae613` (main)
- **Spec SHA-256:** `83533acd057041cd72e6ae32580cb687bed9dfd2cd21b422bbbe57aa380b9b72` (2878 bytes, verified)

## Spec

# Fix: problem statement renders as an unformatted text wall

**Type:** Fix
**Status:** verified
**Branch:** `fix/problem-statement-formatting`

## The problem

The live-room problem pane (`apps/web/src/components/ProblemPanel.tsx:44-50`)
renders the whole statement as one plain `<p>{description}</p>`, so paragraph
breaks collapse into a single wall of text (screenshot 1). LeetCode renders the
same statement with paragraphs, a code block for the Custom Judge snippet,
labeled examples with explanations, and a constraints list (screenshot 2).
`ProblemPanel` also silently drops `example.explanation` even though
`ProblemExample.explanation` exists in `apps/web/src/api/types.ts:84-88`.

Data reality (checked before speccing): stored descriptions are plain text, not
markdown. The 18a cleaning stripped LeetCode's bold/inline-code markup
(`content/dsa/problem-content-enrichment.json`, e.g. `prob_move-zeroes`).
So adding a markdown dependency cannot recover LeetCode fidelity; the fix is a
dependency-free structured rendering of the shape we own.

## The fix

Render the statement with LeetCode-like structure in `ProblemPanel`, no new
dependency, backend and stored data untouched:

- Split `description` on blank lines into separate paragraphs.
- Detect the judge-code section (the `Custom Judge:` block: lines that look
  like code such as `int[] nums = [...]; // ...`, `assert ...;`) and render it
  as `<pre><code>` instead of prose.
- Show each example's `explanation` under its sample row (or under the samples
  table); empty/missing explanations render nothing, no placeholder.
- Constraints list and samples table stay as they are. Loading, title-only
  gap, and empty states stay byte-for-byte in behavior.

Must not break: problem-content API shape, starters shown verbatim, sandbox
run/submit paths, and the existing pane states above. Pure client rendering
change only.

## Build steps

- [x] Step 1 - Statement body: paragraph splitting + judge-code `<pre>` block
  in the problem pane (pure helper beside usage per client naming convention,
  with a focused unit test for paragraph/code classification). Done when the
  Remove-Duplicates statement shows separate paragraphs and the judge snippet
  in a code block, and the new unit test passes.
- [x] Step 2 - Show sample explanations under the samples table (nothing when
  absent). Done when sample 1/2 of Remove-Duplicates show their explanation
  text and problems without explanations render exactly as before.

## Verify

- Open a live-room problem with a multi-paragraph statement (e.g.
  Remove Duplicates from Sorted Array): paragraphs broken out, judge code in a
  monospace block, explanations visible under samples, constraints list
  unchanged.
- `pnpm --filter @interview-coach/web typecheck` clean and the new unit test
  green; title-only gap problem still shows the "No description" note.

## What changed

- `apps/web/src/components/problem-statement.ts` (new): pure `splitStatement`
  helper, blank-line paragraphs, judge-code detection (`;`, `//`, keyword
  leads, braces), `{kind, text}` blocks.
- `apps/web/src/components/ProblemPanel.tsx`: prose blocks render as `<p>`,
  code blocks as `<pre><code>`; sample explanations as full-width table rows
  (`Sample N: ...`, nothing when absent).
- `apps/web/tests/problem-statement.test.ts` (new, 4 tests): paragraph split,
  constraint prose stays prose, judge-snippet classification, CRLF/empty
  handling. One iteration: closing `}` line added to the code-line pattern.
- `apps/web/tests/render-smoke.test.tsx`: new pane test covering paragraphs,
  `<pre>`, shown explanation, and absent `Sample 2:` without explanation.

## Verification evidence

- `pnpm --filter @interview-coach/web typecheck`: clean.
- `pnpm build` (`tsc -b`): clean.
- Focused: `problem-statement.test.ts` + `render-smoke.test.tsx`, 32/32 green
  (existing pane gap/loading tests unchanged, proving those states intact).
- Full `pnpm test`: 79 files, 1249 tests green.
- No em dashes in new/edited content.

## Manual try path

Start web + backend, open a live room on Remove Duplicates from Sorted Array:
statement shows separate paragraphs, judge snippet in a monospace block,
explanations under samples 1-2, constraints list unchanged.
