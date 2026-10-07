# UI Rebuild v1.1 Plan (Stitch → Penpot → Code)

Goal: rebuild the Interview Coach UI with a fresh design system, stitched markup, Penpot authority, and code that matches the design exactly. Marketing is public; onboarding collects context pre-auth, final step asks to sign in; dev mode can bypass sign-in for local testing.

## Phase 1 — Stitch (generate + design system)
- Create Stitch project “Interview Coach v1.1”.
- Design system: calm/technical palette; headings (Space Grotesk or Manrope), body (Public Sans); 8px radius; clear focus states; semantic colors (neutral/positive/warning/error/active); functional motion only.
- Generate screens/state variants:
  - Marketing/landing (public): hero, capabilities, feature grid, testimonials/metrics, CTA “Start practice”, nav/footer.
  - Onboarding (pre-auth): role/level/goals, interview type preference, voice/text preference, duration default, consent; final step prompts sign-in. Dev bypass flag for local.
  - Dashboard: preparing-for header, recommendation card (primary CTA), curriculum progress, strengths/weaknesses, recent interviews, profile summary.
  - New Interview/Config: type, difficulty, mode (realistic/coaching), voice vs text, duration.
  - Lobby/Briefing: recommended topic/problem, difficulty, duration, evaluation criteria, mic readiness, session readiness gate.
  - Live Interview: two-column (conversation + progress/coaching), voice states (connecting/listening/user speaking/thinking/AI speaking/paused/error), waveform indicator, mute/pause/end, transcript, coaching panel (guided), text fallback.
  - End confirm, Evaluation loading, Results, Transcript Review, History, Progress, Settings, Error/Empty/Loading states.
- Export Stitch CSS + markup for reference.

## Phase 2 — Penpot (recreate + refine)
- Rebuild all Stitch screens/components in Penpot with identical tokens.
- Fix spacing/overlaps/readability; ensure accessibility contrast/focus.
- Responsive variants: desktop/tablet/mobile.
- Component library: buttons, cards, tabs, filters, tables, progress bars, charts, dialogs, waveform, transcript list, nav shells, CTAs, status chips.

## Phase 3 — Code (implementation)
- Map Penpot components to React in `apps/web`: marketing shell vs app shell.
- Onboarding flow: local cache for pre-auth data; final sign-in gate; dev flag to bypass auth.
- Auth stance: marketing public; onboarding collects context; sign-in required to persist, except dev bypass.
- Implement Dashboard/Lobby/Live/Results/History/Progress/Settings per spec; voice state UI with ARIA/non-color indicators.
- Accessibility: keyboard focus, screen-reader labels for voice states, sufficient contrast.
- Config: `DEV_BYPASS_AUTH` (or similar) for local dev only.

## Current implementation plan (Stitch → code, no Penpot)

Order of execution (reuse shared primitives, keep Stitch breakpoints ~768px/1024px, chip/pill semantics from landing/dashboard):

1) Shared primitives: section head + pill/badge, CTA card, progress track, chip list, table shell, coach panel, voice rail (state + waveform + controls), timeline row, form card. Add any missing spacing/breakpoint tokens.
2) Lobby/Live: briefing summary (type/difficulty/duration/mode), evaluation criteria, mic/system readiness, Begin/Back; live header (type/difficulty/timer/live), two-column transcript + progress/coaching, voice rail, controls, coaching panel (Hint/Clarify/Feedback), text fallback, responsive collapse.
3) Evaluating: centered card with title + checklist steps and spinner; back-to-dashboard option.
4) Results: header metadata, overall score/tier, dimension grid, what went well / improve next, CTAs (review, practice weak areas).
5) Transcript Review: timeline with timestamped turns + tags + code blocks; sidebar with score/dimensions and quick actions (practice weak areas, download); filters if present.
6) History: search + filters (type/score/date/difficulty/mode), quick filter pills, table/list with review links, empty state.
7) Progress: trend chart placeholder, per-type performance cards, strengths/weak areas with Start Practice, improvement notes.
8) Settings: General, Voice, Interview defaults, AI (advanced), Privacy; consistent cards/toggles/inputs.

Execution: apply per-screen, reuse primitives (no one-off CSS), keep existing data wiring, run `pnpm --filter @interview-coach/web test` + `... build`, commit per screen/batch.

## Notes
- Grounded in `docs/interview-coach-ui-specification.md` and `docs/implementation-roadmap.md` constraints (backend owns truth; guests only for marketing/dev bypass).
- Penpot is the final visual authority; code must match Penpot.
