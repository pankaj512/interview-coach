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
- [ ] 18. **Problem content and Submit** - Postgres is the system of record with the existing lookup cache as a build-time import source only; generic-`solve` starters plus array-encoded sample cases (native runners and node helpers explicitly parked); all 300 problems reseeded; new problem-content endpoints with old ones retired later; AI-only Submit with no sandbox run and no persistence in this pass
  - [ ] 18a. **Problem data cleaning and starter/case generation** - cleaned statements, constraints, array-encoded sample cases, and generic-`solve` starters ready for import; no hidden tests, AI judges correctness
  - [ ] 18b. **Full problem reseed** - all 300 problems reseeded from the cleaned data in one pass
  - [ ] 18c. **Problem-content API and client wiring** - new problem-content endpoints adopted by the problem pane; existing endpoints untouched, retirements deferred
  - [ ] 18d. **AI-only Submit** - backend second-AI correctness/optimality verdict with break-points and edge cases; voice stays interview-only
- [ ] 19. **Loop verification** - end-to-end dashboard -> lobby -> live -> evaluating -> results -> history/progress against a live DB, no new product functionality
- [x] 20. **Client URL routing** - History-API routing for the web client (no new router dependency): every nav view and auth/ritual state gets a real URL, browser back/forward works, refresh and deep links land somewhere sane; in-page `#how/#scoring/#why` anchors keep working

## Deferred to v2 - not next, listed so nothing is lost

- [ ] V2-1. **Security, observability and failure handling** (roadmap Phase 14)
- [ ] V2-2. **Testing strategy consolidation** (roadmap Phase 15, domain-first suite)
- [ ] V2-3. **Final integration and production readiness** (roadmap Phase 16, no new functionality)
- [ ] V2-4. **Prod identity and voice** (parked S8d: social/Entra second issuer, account erasure, Entra ephemeral mint; needs user-created provider resources)
- [ ] V2-5. **Product expansion tracks** (System Design, Behavioral, Backend, Frontend, ML, Resume-based, Company-specific; eval-dimensions delta per track)
