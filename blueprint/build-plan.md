# Build Plan

Ordered against `docs/implementation-roadmap.md` (Phases 1-16) and git reality
(`git log --oneline`). Shipped items stay checked and are never renumbered;
their specs live in `docs/SESSION_HANDOFF.md` tags. Run `/feature` for the next
unchecked item. When the plans change, re-run `/overview`.

## Shipped - the learning loop through Phase 13

- [x] 1. **Architecture principles and boundaries** - HLD/frozen/ADR-002 aligned, LLM-is-advisory rule
- [x] 2. **User profile and onboarding** - `UserProfile`, taxonomy, `GET/PUT /api/profile`, required first-run gate
- [x] 3. **Curriculum and skill state** - server-owned curriculum (12/59/300), `UserSkillState`/`UserCurriculumProgress`
- [x] 4. **LLM recommendation service** - synchronous generate, candidate-set validation, deterministic fallback
- [x] 5. **Dashboard** - server-backed control center, recommendation CTA, Start-from-recommendation
- [x] 6. **Lobby** - recommendation + mic + session prep, manual Setup retired
- [x] 7. **Interview room + Voice Live** - profile/topic/objective/skill injected into mint, frozen config intact
- [x] 8. **Backend tool architecture** - canonical 4-tool surface, deprecated aliases for CLI harness, `call_id` dedup
- [x] 9. **Interview persistence** - transcript capture, `GET /api/interviews` history, recommendation linkage
- [x] 10. **LLM evaluation service** - async job on end, validated structured evaluation, fallback never loses interviews
- [x] 11. **Skill and curriculum update** - deterministic monotonic mastery, idempotent per evaluation
- [x] 12. **Adaptive learning loop** - evaluation triggers supersede + regenerate, loop metrics
- [x] 13. **History and progress** - server-backed History/Progress/Weak-Areas, localStorage authority retired

Foundations also shipped (pre-roadmap): domain model, Postgres persistence,
Fastify backend + voice session, Vite client + voice loop, code sandbox,
S8a hardening (auth gate, rate limits, quotas, probes/metrics), S8b deploy
platform (retention, Prometheus, containers, CI), S8c local accounts +
per-interview ownership, audit remediation P1-P8.

## Next - stabilize current (per user interview)

- [x] 14. **Green main** - fix 2 `pnpm typecheck` errors (`learning-loop.test.ts` dimension key, `render-smoke.test.tsx` missing `evaluationStatus`) and the 3 resulting test failures so CI is green
- [x] 15. **Web client UI prototype** - rethink the spec from fresh with throwaway static mockups (`/prototype`); replacement for `docs/interview-coach-ui-specification.md`; approve before any client rewrite
- [x] 16. **Isolated multi-language sandbox** - properly isolated code execution for C++/JS/Python behind the existing sandbox routes; retires the local JS/Python runner on security grounds; the Test button (item 17) depends on it
- [x] 17. **Fresh web client UI rebuild** - rewrite screens/components from scratch on the approved prototype; keep `api/backend-client`, voice-client/tool-forwarder, and backend APIs; small API additions only with a proven gap; problem pane is title-only until item 18
  - [x] 17a. **Theme, shell, public screens** - port `prototypes/theme.css` into the app, rebuild AppShell/nav plus Landing, Sign-in, Create-account, Onboarding
  - [x] 17b. **Practice loop screens** - rebuild Dashboard, Lobby, Live, Evaluating on the new theme
  - [x] 17c. **Feedback screens** - rebuild Results, Transcript review, Feedback detail, Weak areas
  - [x] 17d. **Account and history screens** - rebuild History, Progress, Settings, Profile; delete consumed `prototypes/`
- [x] 18. **Problem content, shared runners, and Submit** - Postgres is the system of record with the existing lookup cache as a build-time import source only; editors show the fetched LeetCode starters verbatim; a committed shared shape-runner library (one runner per I/O signature shape per language, problems link `{runnerId, entry, codecs}`, inline runner only when no shape fits, shared ListNode/TreeNode prelude per language) makes Test executable in the sandbox; all 300 problems reseeded; new problem-content endpoints with old ones retired later; AI-only Submit with no sandbox run and no persistence in this pass
  - [x] 18a.1. **Python: cleaned data + shared runners** - cleaned statements, constraints, array-encoded sample cases for all 300; Python starter-signature census; shared Python node-type prelude + shape runners; `{runnerId, entry, codecs}` link metadata per problem ready for import; no hidden tests, AI judges correctness
  - [x] 18a.2. **JavaScript: shared runners** - JS starter-signature census; shared JS node-type prelude + shape runners; link metadata per problem; same gate shape as 18a.1
  - [x] 18a.3. **C++: shared runners** - C++ starter-signature census; shared C++ node-type prelude + shape runners; link metadata per problem; same gate shape as 18a.1
  - [x] 18b. **Full problem reseed** - all 300 problems reseeded from the cleaned data in one pass
  - [x] 18c. **Problem-content API and client wiring** - new problem-content endpoints adopted by the problem pane; existing endpoints untouched, retirements deferred
  - [x] 18d. **AI-only Submit** - backend second-AI correctness/optimality verdict with break-points and edge cases; voice stays interview-only
- [x] 19. **Loop verification** - end-to-end dashboard -> lobby -> live -> evaluating -> results -> history/progress against a live DB, no new product functionality
- [x] 20. **Client URL routing** - History-API routing for the web client (no new router dependency): every nav view and auth/ritual state gets a real URL, browser back/forward works, refresh and deep links land somewhere sane; in-page `#how/#scoring/#why` anchors keep working
- [x] 21. **Provider-switchable LLM transport** - one shared chat-completions transport with per-provider entries (Azure AI Foundry + Inception Mercury) behind `LLM_PROVIDER`; recommendation, evaluation, and submit-verdict keep their prompts/parsers/ports and gain live LLM coverage once keys are set

## v1.1 - refactoring milestone (before v2; no behavior change)

Release convention: `v1.0` = current main (items 1-21 + audit fixes, tagged);
`v1.1` tagged on the milestone merge. Workspace packages stay `0.1.0`
(private, never published); tags carry release meaning. Run `/feature` for
the next unchecked item.

- [x] V1.1-1. **Apps/packages layout + rename (same window)** - `packages/backend`
  -> `apps/api` (`@interview-coach/api`), `packages/web-client` -> `apps/web`
  (`@interview-coach/web`), `packages/domain` -> `packages/core`
  (`@interview-coach/core`), `packages/db` -> `packages/store`
  (`@interview-coach/store`); all `@interview-coach/*` specifiers, `--filter`
  flags, Dockerfiles, compose, CI paths, and live docs updated in one pass;
  `s0-smoke.*` strays get a home; lockfile regenerated; `blueprint/history/*`
  left immutable
- [x] V1.1-2. **Test kind-split** - `test:unit` (pure, no infra) /
  `test:integration` (needs Postgres/Docker; warn-and-pass locally, live in
  CI) / `test:e2e` (compose boot + probes, ported out of CI bash) via vitest
  projects + CI jobs; no `test:staging`/`test:prod` until those environments
  exist (V2-3/V2-4)
- [x] V1.1-3. **Retirements + drift sweep** - retire the pre-18c problem
  endpoints left byte-identical by 18c and the deprecated CLI-harness tool
  aliases (after confirming no callers); fix the `project-plan.md` §3/§7
  drift as part of this plan update

## Deferred to v2 - not next, listed so nothing is lost

- [ ] V2-1. **Security, observability and failure handling** (roadmap Phase 14)
- [ ] V2-2. **Testing strategy consolidation** (roadmap Phase 15, domain-first suite)
- [ ] V2-3. **Final integration and production readiness** (roadmap Phase 16, no new functionality)
- [ ] V2-4. **Prod identity and voice** (parked S8d: social/Entra second issuer, account erasure, Entra ephemeral mint; needs user-created provider resources)
- [ ] V2-5. **Product expansion tracks** (System Design, Behavioral, Backend, Frontend, ML, Resume-based, Company-specific; eval-dimensions delta per track)
