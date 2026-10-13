# Fix: reseed DSA descriptions as markdown from LeetCode

**Type:** Fix
**Status:** verified
**Branch:** `fix/reseed-markdown-descriptions`

## The problem

Problem descriptions are plain text everywhere: the seed dataset
(`content/dsa/problem-content-enrichment.json`, gitignored local content),
the per-problem cache (`content/dsa/problems/*/problem.json`, also gitignored),
and the seeded Postgres rows. `ProblemPanel` renders them with a plain-text
splitter (paragraphs + judge code block, no markdown support). Wanted: real
LeetCode descriptions with formatting, updating descriptions only.

Direction change (user review 2026-10-12): no custom HTML-to-markdown
converter. LeetCode serves descriptions as HTML; we store that HTML verbatim
and render it verbatim (sanitized). A converter has to cover every tag
LeetCode uses and silently mangles the rest; raw HTML renders whatever ships,
today and for future problems.

## The fix

Three parts, description fields only (title, difficulty, examples,
constraints, starters, runner links untouched):

- **Fetch (existing script, rewritten trim):** Python Playwright
  (`packages/store/scripts/fetch-leetcode-descriptions.py`) reads all 300
  `leetcode` urls from `raw_content/dsa/dsa-problem-catalog.json`, loads each
  problem page politely (small delay between requests, real user agent), and
  stores the description element's `innerHTML` **verbatim** into the
  `description` field of each per-problem cache file
  (`content/dsa/problems/<topic>/<slug>/problem.json`), with exactly three
  structural trims: Example `<p>` + following `<pre>` pairs are dropped
  (examples live in the structured `examples` field and render as the samples
  table), the Constraints `<p>` + following `<ul>` are dropped (constraints
  render from the structured `constraints` field), and empty/`&nbsp;`-only
  `<p>` spacers are dropped. Everything else keeps its original bytes:
  unknown tags pass through untouched, so there is no tag-coverage problem.
  Then the existing `db:content` generator rebuilds
  `content/dsa/problem-content-enrichment.json` from the cache. A fetch
  report records fetched / failed / skipped counts plus per-id lines. A
  failed fetch never clears a description: the existing text stays. The
  script is rerunnable and skips ids already marked fetched in the previous
  report unless `--force` is passed.
- **Reseed:** run `db:seed` (`DATABASE_URL` set, local Postgres via
  `docker compose up db`). The seed upserts whole rows, but every non-
  description field in the enrichment file is byte-identical, so in effect
  only descriptions change in the DB. Confirm with a count of rows whose
  description changed plus a spot check (e.g. move-zeroes).
- **Render:** `ProblemPanel` renders HTML descriptions with
  `dangerouslySetInnerHTML` after sanitizing with **DOMPurify** (new
  dependency, justified: third-party HTML lands in our page; strips scripts,
  event handlers, forms, and `class`/`style`/`id` attributes while keeping
  content tags incl. `img`). `react-markdown` and the `looksLikeMarkdown`
  heuristic go away; the renderer picks the HTML path when the description
  starts with a content tag, and the plain-text splitter stays for legacy
  plain-text descriptions and the no-description gap note.

Must not break: seed idempotency and gap behavior (F-05 abort stays),
starters/constraints/examples/runner links byte-identical, divider/scroll
work, Test/Run paths, no-description gap problems. The fetched HTML
lands in the gitignored per-problem cache first; the generator rebuilds the
dataset from the cache, so the two stay consistent by construction.

Known risks: LeetCode bot protection or rate limits may block part of the
fetch; the report makes that visible and failures keep old text. Scraping is
kept polite (sequential, delays); this is a one-off local refresh, and only
the scripts (not the fetched data) are committed.

## Build steps

- [x] Step 1 - Fetch script + trial: Playwright fetch over catalog urls with
  saved HTML fixtures and a trial id end to end (done on the converter path;
  infra reused).
- [x] Step 2 - Converter-path full fetch + reseed (superseded): 300/300
  fetched, dataset regenerated via `db:content`, `db:seed` OK, DB verified.
  Superseded by the raw-HTML direction; kept as history.
- [x] Step 3 - Raw-HTML fetch + reseed: replace the converter with the
  verbatim trimmer (unit-tested on saved fixtures, incl. Example/Constraints
  trimming and unknown-tag passthrough), delete the converter module and its
  tests, re-fetch all 300 (`--force`), regenerate with `db:content`, run
  `db:seed`, confirm the changed-description count and the spot check. Done
  when the DB holds verbatim LeetCode HTML (minus trimmed sections) where
  the fetch succeeded and old text everywhere else, with all other columns
  unchanged.
- [x] Step 4 - Sanitized HTML rendering: DOMPurify in `ProblemPanel`,
  renderer tests (formatting renders, `<script>`/event handlers stripped,
  plain-text and gap states unchanged), `react-markdown` removed. Done when
  a fetched description renders exactly as authored and gap/no-description
  states render exactly as before.
- [x] Step 5 - Statement readability (follow-up 2026-10-12): paragraph
  spacing for the injected description HTML (the global `p { margin: 0 }`
  reset packs LeetCode paragraphs wall-to-wall), and LeetCode-style stacked
  samples (Example N / Input / Output / Explanation blocks) replacing the
  Case/Input/Expected table in `ProblemPanel`. Done when the
  remove-duplicates pane shows spaced paragraphs and stacked samples with
  Input/Output/Explanation labels, and the smoke tests assert the new
  markup (no `table` in the samples section).
- [x] Step 6 - Viewport-pinned panes: the live room (standalone `.room`,
  already a `min-height: 100vh` flex column) pins to the viewport height so
  each side scrolls internally (`overflow-y: auto`) instead of pushing the
  whole page. The transcript sticky-follow retargets from the window to the
  left column element (same `shouldFollowTranscript` predicate). The
  stacked mobile layout (<=900px) keeps natural heights + page scroll.
  Done when a long statement scrolls inside the left pane with no page
  scrollbar on desktop, the transcript still follows only when near the
  column bottom, and typecheck + focused + full suites pass.
- [x] Step 7 - Transcript-cap override repair: the later
  `.live-grid .transcript-list` rule (~styles.css:2533) re-imposed
  `max-height: 420px; overflow-y: auto`, beating the Step-1 uncap on source
  order, so the transcript kept an inner scrollbar. Drop only those two
  declarations (keep the list's base styling). Done when no live-grid
  transcript rule sets max-height/overflow, and typecheck + focused + full
  suites pass. (The user's whole-page scrollbar beside it is a stale tab
  predating Step 6 - served CSS already carries it; hard-refresh is the
  fix.)

## Verify

- Fetch report reviewed: fetched vs failed counts, no description ever
  blanked by a failure.
- `move-zeroes` row in the DB holds HTML matching its LeetCode page;
  a gap problem still shows the "No description" note.
- `pnpm --filter @interview-coach/web typecheck` clean, focused tests green,
  full `pnpm test` green.

<!-- blueprint:completion {"schemaVersion":1,"specBytes":7271,"specSha256":"59f616f7e867638e84dfea543936f408dda15babbed4d28b76fe611e08e8a503","branch":"refs/heads/fix/reseed-markdown-descriptions","head":"75372a31e1a51bcd336021e45970ef83a96338cb","baseRef":"refs/heads/main","baseCommit":"75372a31e1a51bcd336021e45970ef83a96338cb","sourceTree":"586aa29e74699535511d9d11bd22e71431a4710a","absentOptional":[]} -->

## What changed

- Fetch pipeline (`packages/store/scripts/`, gitignored local tooling):
  `leetcode_trim.py` stores verbatim LeetCode description HTML with only
  structural trims (Example/Constraints blocks, nbsp spacers dropped);
  `fetch-leetcode-descriptions.py` writes the per-problem cache.
- `generate-problem-content.mts` (gitignored): three stale paths fixed;
  dataset regenerated through it (300 problems, all-HTML descriptions).
- Data (gitignored): 300/300 cache files refetched; `db:seed` OK.
- Renderer (`apps/web`): `isomorphic-dompurify` + `isHtmlDescription`
  routing; sanitized HTML in `.statement-html` (paragraph rhythm restored);
  samples as LeetCode-style stacked Example/Input/Output/Explanation list.
- Panes: room pinned to viewport (`100dvh`), each pane scrolls internally;
  transcript cap-override removed; sticky-follow retargeted to left column.

## Verification evidence

- `pnpm --filter @interview-coach/web typecheck`: clean.
- `pnpm build` (`tsc -b`): clean.
- Focused suites (render-smoke, code-workspace, problem-statement): 79/79.
- Full `pnpm test`: 79 files, 1255 tests green.
- DB: 300 rows; remove-duplicates description is verbatim LeetCode HTML.
- Headless-Chromium harness on real styles.css: page holds viewport height,
  panes scroll internally. Final pixels need a hard-refreshed browser tab.

## Manual try path

Hard-refresh the 5173 tab, open a live room: statement renders as authored
HTML with spacing; samples stack as Example/Input/Output/Explanation; each
pane scrolls inside the viewport with no page scrollbar; transcript follows
near the column bottom.

## Completion

- **Completed:** 2026-10-12 via `/complete` on branch
  `fix/reseed-markdown-descriptions` (head == base == main@75372a3).
- Deliberate exception: none pending; the transcript-band redesign is new
  work for a follow-up fix.
