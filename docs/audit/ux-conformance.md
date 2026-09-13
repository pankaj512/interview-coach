# Audit — UX Conformance vs UI Specification

- **Scope:** `packages/web-client` (S4/S6/S6.1 screens, components, design
  system, voice loop, state) audited against
  `docs/interview-coach-ui-specification.md`.
- **Precedence:** the UI specification is **normative** for this audit. Where
  it conflicts with the HLD, `docs/architecture-frozen.md`, or the existing
  build-phase audits, the UI spec wins. The earlier phase audits (0–8) treated
  the UI spec as a *secondary* reference; this audit reverses that and is
  therefore the first spec-first review of the product surface.
- **Out of scope:** CLI sections §31–§33 (the CLI is the external harness at
  `/home/pankaj/dev/Projects/InterviewCoachCli`, per AGENTS.md — never
  duplicated here). Backend/tool contracts are audited in phases 1–8; only the
  client surface is judged here.
- **Method:** read the full spec, then read every web-client source file and
  compare section by section. No live browser run (visual/pixel fidelity is
  judged from `tokens.css`/`styles.css` and component structure).

## MVP boundary (spec §44)

The spec itself scopes the first version. Findings are graded against it:

- **MVP screens:** Start/New Interview, Interview screen, Voice states, Text
  transcript, Pause/end controls, Evaluation/loading, Results, Basic interview
  history, Settings.
- **Explicitly deferred:** advanced progress analytics, learning plans,
  question marketplace, social features, gamification, resume management,
  complex personalization.

Consequences for severity: the Dashboard (§4) and Progress dashboard (§27) are
**not** MVP screens (the spec defers progress analytics and omits the dashboard
from §44), so their absence is a *deferred-scope* note, not a defect. Settings
(§30) **is** MVP and its total absence is a defect.

## Severity rubric (UX)

- **Critical** — the spec's core promise/journey is broken; a candidate cannot
  complete the intended experience.
- **Major** — a spec MVP screen/section is missing or materially wrong.
- **Minor** — a spec section is partially implemented; usable but degraded.
- **Nit** — copy, visual polish, or developer-facing surface.

## Executive summary

The shipped client is a competent **engineer's interview tool**, not the
**professional practice environment** the spec describes. It nails the
foundation (design tokens, dark theme, icon+label state semantics, responsive
breakpoints, accessible focus outlines) but omits the human-facing half of the
spec. The four highest-impact problems:

1. **The candidate scores themselves** (UX-26). The spec's evaluation is
   AI-produced after the interview; the client renders a manual "Finalize
   evaluation" form.
2. **No pause/mute and no real voice states** (UX-12/13/14). The core room
   controls and the "You're speaking / paused / thinking" feedback the spec
   makes central are absent.
3. **No text fallback** (UX-18), despite §16/§42 ("voice must never be the
   only way to interact").
4. **The conversation is not the focus** (UX-15/16). Only the latest 3 captions
   show; there is no transcript, no interview progress, and the room's right
   side is a code sandbox.

Plus one normative conflict: **evaluation dimensions follow the HLD, not the
spec** (UX-28), and the code says so explicitly.

## Findings

### App shell / navigation / setup (§2–§7)

| ID | Severity | Evidence | Spec ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| UX-1 | Minor | `App.tsx:21` (`Phase = setup\|devices\|lobby\|live\|results\|history`); no dashboard/progress/settings routes | §2, §3, §43 | No application shell or persistent primary navigation. The app is a linear wizard with no Dashboard/History/Progress/Settings nav. §44 excludes Dashboard/Progress from MVP, but the spec's journey (§43) still starts at a Dashboard and the nav model (§2/§3) is absent. | Add a shell with primary nav; at minimum wire History + Settings into it. Treat Dashboard/Progress as the deferred §44 scope. |
| UX-2 | Minor | `App.tsx:25` entry phase is `"setup"`; no `DashboardScreen` | §4 | No Dashboard (Start/Continue, performance summary, recent interviews). Deferred by §44, but it is the spec's home screen and the "Continue Practice" affordance has no equivalent. | Defer explicitly in docs; when built, reuse `history.ts` + evaluation snapshots for the summary. |
| UX-3 | Minor | `history.ts:22-23` (localStorage, cap 20); `HistoryScreen.tsx` | §26 | History is browser-local, capped at 20, with no search, filters, date grouping, score, or duration. Spec §26 is a searchable/filterable/grouped list with a "Review →" action. "Basic interview history" is MVP. | Server-backed history endpoint + search/filter/group; render score/duration from persisted evaluation. |
| UX-4 | Major | `SetupScreen.tsx:15,92` (`Easy\|Medium\|Mixed`); `ds/status.tsx:85` (Hard accepted, else→Medium) | §5, §23 | Difficulty options are `Easy/Medium/Mixed`; the spec requires `Easy/Medium/Hard`. "Hard" is unreachable as a config target and "Mixed" is not in the spec. This is the domain F1/C4-7/I5-2 split, but spec precedence makes it a Major UX defect. | Unify to `Easy\|Medium\|Hard\|Mixed` end-to-end (domain, schema, client types, pills). |
| UX-5 | Major | `SetupScreen.tsx:105-113` (DSA selected, System design disabled "Soon") | §6, §44 | Only one interview type is selectable; spec §6 says the initial UI should support Coding, System Design, Backend, Behavioral, and Resume/Project Deep Dive. | Either implement the type selector, or record an explicit spec deviation (DSA-only MVP) in the spec/product decisions. Do not present disabled cards as the product. |
| UX-6 | Major | no `mode`/`style` anywhere (grep); `SetupScreen.tsx` | §7, §43 | No Realistic Interview vs Guided Coaching mode. §7 requires the difference be obvious *before* starting; the journey §43 includes "Choose Mode". | Add a mode selector; gate hint affordances by mode (see UX-23). |
| UX-7 | Major | `SetupScreen.tsx` (voice-only; no Voice/Text control) | §5, §16 | No Voice vs Text choice on the New Interview screen. | Add the Voice/Text selector; wire the text path (UX-18). |
| UX-8 | Minor | `SetupScreen.tsx:96-100` (topbar has "History", no Back) | §5 | Setup has no "← Back" affordance; the spec's New Interview header shows Back. | Add Back (or make the shell nav the Back target). |
| UX-9 | Minor | `SetupScreen.tsx:115-118` (candidate id field) | §2, §5 | A raw `candidateId` text field is a primary config input. The spec derives identity from Profile/Settings, not a setup text box. | Hide it behind Settings/account; default to the signed-in identity. |
| UX-10 | Minor | `SetupScreen.tsx:149-190` (auto-select, problem ids, browse/search/difficulty) | §5 | Developer-facing problem-selection controls sit on the calm primary setup screen; the spec's New Interview screen has none. | Move problem selection to an advanced/Settings surface; keep the default auto path. |

### Interview preparation (§8)

| ID | Severity | Evidence | Spec ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| UX-11 | Minor | `LobbyScreen.tsx:33-71` | §8 | The briefing is a config recap. §8 requires "You will be evaluated on:" criteria, the mode, and a "Begin Interview" CTA. Impl shows Interview id/status/difficulty/duration/problems and a "Join interview" button. | Add the evaluation criteria + mode to the recap and rename the CTA to "Begin Interview". |

### Main interview screen (§9–§19)

| ID | Severity | Evidence | Spec ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| UX-12 | Critical | `LiveScreen.tsx` (no pause/resume control); `backend-client.ts:181` (`pauseInterview` exists, unused) | §14, §17, §46 | **No Pause/Resume.** §14/§17 list Pause/Resume as a primary control and §46 defines a `PAUSED` state. The backend route exists but the room never calls it, so the `paused` lifecycle is unreachable from the UI. | Wire a Pause/Resume control to `pauseInterview`/resume; render the paused voice state and suspend mic. |
| UX-13 | Critical | `LiveScreen.tsx:52-58,164-171` (only tab-hidden = "mic blocked"); no mute control | §14, §17 | **No Mute/Unmute.** The mic is always hot; the only "blocked" signal is tab visibility. §14's primary controls are Mute/Unmute, Pause/Resume, End. | Add Mute/Unmute that stops mic capture (`MicCapture.stop`) and surfaces the muted voice state. |
| UX-14 | Major | `ds/model.ts:55` (`VoicePhase = speaking\|listening\|thinking\|muted`); `ds/model.ts:86` (`void input.candidateSpeaking`) | §12, §46 | **Voice states are incomplete and one is intentionally discarded.** §12 requires Connecting, Listening, User speaking, AI thinking, AI speaking, Paused, Error. `candidateSpeaking` is computed (`use-interview.ts:103,151`) then ignored by `voiceViewFor`, so "You're speaking" can never render. "Paused" is absent; "Muted" is repurposed for tab-hidden; "Thinking" is overloaded onto connecting/reconnecting. | Split connection vs voice-phase state; add `userSpeaking`, `paused`, and distinct `error`; stop ignoring `candidateSpeaking`. |
| UX-15 | Major | `LiveScreen.tsx:174-189` (live grid = ProblemPanel + CodePanel); no progress panel | §9, §19 | **No Interview Progress panel.** The spec's main screen pairs the conversation with a progress checklist (Requirements → API → Architecture → …). The impl pairs the problem with a code sandbox; there is no session/progress indicator. (Root cause is the missing multi-problem progression, F2/I5-3.) | Add a progress panel driven by backend problem order; expose advance/skip (UX ties to F2/I5-3). |
| UX-16 | Major | `LiveScreen.tsx:24-33,60` (latest 3 captions), `147-153`; `Caption` labels "Assistant"/"You" | §11, §37 | **The conversation is not the primary focus.** §11 wants a full INTERVIEWER/CANDIDATE transcript, the latest speaker emphasized, and auto-scroll with scrollback. The impl shows only the latest 3 captions inside the voice rail; there is no transcript view. | Add a real conversation area with scrollback; emphasize the current speaker per §37. |
| UX-17 | Minor | `ds/status.tsx:75` (`"Assistant"`/`"You"`) | §11, §47 | Speaker labels are "Assistant"/"You"; the spec uses "INTERVIEWER"/"CANDIDATE" to reinforce the interviewer role. | Rename roles to Interviewer/Candidate in the conversation UI. |
| UX-18 | Major | `AnswerForm.tsx` ("Record an answer or note", kind + textarea); no text conversation path | §16, §42, §43 | **No text fallback.** §16: if voice is unavailable the candidate switches to text and interview state is unchanged. §42: "Voice must never be the only way to interact." The only text input is an admin-style "record a note" form. | Add a conversational text mode that posts candidate turns and drives the model (or an explicit documented deviation). |
| UX-19 | Minor | `voice-client.ts:357-372` (barge-in cancels) vs `ds/model.ts:86` (candidate state ignored) | §15 | **Interruption feedback is missing.** Barge-in works server-side, but the UI cannot "immediately communicate that the candidate has taken the turn" because the candidate-speaking state is discarded. | Fix UX-14; surface a "You're speaking" state on `speech_started`. |
| UX-20 | Minor | `styles.css:389-415` (CSS keyframe wave); no amplitude wiring | §13 | The waveform is decorative, not amplitude-reactive. §13 says it should react to audio amplitude and not be "excessively decorative". | Drive the wave from the analyser/playback level (or accept as a documented simplification). |
| UX-21 | Minor | `LiveScreen.tsx:82-90` (brand + chip + timer + End) | §10 | Header omits interview type, difficulty, and session status. §10 asks for type · difficulty · elapsed · connection · session status. | Add type/difficulty/session-status to the live header. |
| UX-22 | Minor | `LiveScreen.tsx` (no transcript toggle / in-session settings) | §17 | No transcript show/hide and no in-session safe settings (audio device, volume, transcript). | Add the transcript toggle and a minimal in-session settings affordance. |
| UX-23 | Minor | `HintPanel.tsx:66-82` ("Ask for a hint" only) | §18 | Coaching panel is incomplete and ungated: §18 lists Hint/Clarify/Think aloud/Feedback, hidden or restricted in Realistic mode. There is no mode, so hints are always on. | Complete the coaching actions and gate them by mode (UX-6). |
| UX-24 | Minor | `LiveScreen.tsx:199-212` ("Session activity" event log) | §35, §47 | A raw tool/connection event log is exposed in the room, contradicting "calm, low distraction" and "never feel like a generic chat assistant". | Move to a debug/advanced surface; keep the room focused on the interview. |

### Ending / evaluation / results (§20–§25)

| ID | Severity | Evidence | Spec ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| UX-25 | Major | `ResultsScreen.tsx:62-65` ("Final state is loading…") | §21, §44 | **No "Analyzing Interview" processing screen.** §21 defines an evaluation-processing state with progress steps; "Evaluation/loading" is an MVP screen. The client jumps to Results. | Add the evaluation-processing screen; drive it from an async evaluation status. |
| UX-26 | Critical | `EvaluationForm.tsx:45-107` (candidate enters 0–5 per dimension); `ResultsScreen.tsx:200-202` | §21, §22, §43 | **The candidate scores their own interview.** The spec has the AI evaluate after ending and the candidate *receive* results. The shipped flow asks the candidate to assign dimension scores and submit, which inverts the product and the journey §43 (AI Evaluation → Results). | Make evaluation automatic (or coach-triggered); remove candidate self-scoring from the primary results path. |
| UX-27 | Major | `ResultsScreen.tsx:93-123` (bars + small "Overall" line); no Review/Practice CTAs | §22 | Results hero deviates: §22 shows a large overall score with a band label ("8.1 / 10 · Strong") and `[Review Interview] [Practice Weak Areas]` actions. Impl shows per-dimension bars and a small overall line; no band label, no Review/Practice actions. | Add the score hero + band label and the two CTAs. |
| UX-28 | Major | `EvaluationForm.tsx:15-24`; `ResultsScreen.tsx:3-4` ("the HLD set is normative") | §23 | **Evaluation dimensions follow the HLD, not the spec.** Spec §23 lists Technical correctness, Problem solving, System design, Communication, Trade-off analysis, Depth of knowledge, Code quality, Requirement clarification; impl uses `understanding/approach/correctness/complexity/edge_cases/communication/code_quality/independence`. The code comment explicitly subordinates the spec — contrary to the stated precedence. | Align dimension names/set to §23 (or record an ADR-level deviation). |
| UX-29 | Minor | `ResultsScreen.tsx:98-109` (bars + optional notes) | §24 | No per-dimension feedback drill-in (Strengths / Opportunities / Example improvement). | Add a dimension detail view. |
| UX-30 | Major | `ResultsScreen.tsx:26-34,171-185` (latest 6 turns, no timestamps) | §25 | **No transcript review screen.** §25 wants the complete interview with timestamps and marked important moments; impl shows the latest 6 turns verbatim, current session only. | Add a transcript review screen; persist turns server-side so it survives reload. |
| UX-31 | Minor | `LiveScreen.tsx:239-251` | §20 | End dialog copy deviates and leaks internal state: no elapsed duration, no "End & Evaluate" framing, and it says "moves the interview to Completing". Spec: "Your interview is currently N minutes long… [Continue Interview] [End & Evaluate]". | Rewrite the dialog copy to §20; use user language, not lifecycle states. |
| UX-32 | Minor | `ResultsScreen.tsx:187-196`; `curriculum.ts` | §28, §29 | No weak-area view and no targeted-practice start; only a curriculum module suggestion. §29's "15-minute focused interview" action is absent. | Add weak-area drill-down + a preconfigured focused-practice start. |

### Settings / progress (§27, §28, §30)

| ID | Severity | Evidence | Spec ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| UX-33 | Major | no settings screen (file listing); `AuthPanel.tsx` inline on Setup only | §30, §44 | **No Settings screen at all.** §44 lists Settings as MVP; §30 defines General/Voice/Interview/AI/Privacy sections. Only an inline account panel exists. | Build the Settings screen; at minimum General/Voice/Privacy. |
| UX-34 | Minor | no progress screen; `ResultsScreen.tsx:187-196` only | §27, §28 | No progress dashboard or weak-areas view. §44 defers "advanced progress analytics", so a minimal trend is arguably out of MVP — but the journey loop (§43) expects feedback → weak area → practice. | Defer explicitly, or add a minimal trend once evaluations accumulate. |

### Cross-cutting: states, errors, accessibility (§34–§42, §46)

| ID | Severity | Evidence | Spec ref | Shortcoming | Fix direction |
|---|---|---|---|---|---|
| UX-35 | Minor | `LiveScreen.tsx:115-125` (failed → Retry), `214-225` (closed → Rejoin) | §39 | Error states are incomplete: no "Switch to Text", no model/API error surface, no auth-expired flow, no session-recovery Resume/Discard. The `closed` "Rejoin" button is also non-functional (audit C4-1). | Add the §39 recovery actions; fix C4-1 so Rejoin works. |
| UX-36 | Minor | `LiveScreen.tsx:229-254` (no Escape/focus trap); no M/P/T/Q shortcuts | §33, §42 | Accessibility gaps: the end dialog has `aria-modal`/autoFocus but no Escape-to-close or focus trap; no keyboard shortcuts; no adjustable text size or skip link. Positives: focus-visible outlines, `role=status`, icon+label non-color states, `prefers-reduced-motion`. | Add Escape/focus trap, keyboard shortcuts, and a text-size affordance. |
| UX-37 | Minor | `ds/model.ts:9-16` (`ChipState`); `ds/model.ts:55` (`VoicePhase`) | §45, §46 | The UI state model is connection-centric; the spec's state model (IDLE→CONFIGURING→READY→CONNECTING→LISTENING→USER_SPEAKING→THINKING→AI_SPEAKING; PAUSED/ENDING/EVALUATING/COMPLETED/ERROR) is not represented. There is no single state-driven UI layer per §45. | Introduce the spec state model as the UI's source of truth and derive chips/voice from it. |
| UX-38 | Nit | `ResultsScreen.tsx:64` ("Final state is loading…") | §41 | Generic loading copy; §41 prefers "Analyzing your responses…". | Use explanatory loading copy. |
| UX-39 | Minor | `components/{InterviewRoom,StatusBar,ResultsPanel,SetupForm,CodeEditor}.tsx` | §35 | Dead legacy S4 components carry pre-S6 UX and remain unimported (audit C4-4). Drift/maintenance risk. | Delete them. |

## Positives (spec sections already met)

- §3 design tokens implemented normatively (`tokens.css`, dark theme, 44-token
  mapping) and used throughout `styles.css`.
- §36 color semantics: every state is icon + label, never color-alone
  (`ds/status.tsx`, `ds/model.ts`); voice green reserved for voice activity.
- §38 animation: functional wave + `prefers-reduced-motion` fallback
  (`styles.css:417-423`).
- §34 responsive: breakpoints at 1100px/760px, rail reflow, single-column mobile
  (`styles.css:802-846`).
- §40 empty state for history (`HistoryScreen.tsx:32-41`).
- §41 some explanatory loading copy ("Establishing the realtime session…",
  "Creating…").
- §42 partial: focus-visible outlines, `role="status"`/`role="meter"`, ARIA
  labels, reduced motion.

## Verification

Read-only audit; no code changed. Evidence is file:line against the current
tree (`packages/web-client/src`). No browser run was performed, so pixel-level
fidelity is inferred from `tokens.css`/`styles.css`. The existing web-client
vitest suites cover pure modules only (api client, tool forwarder, audio, voice
client, ds-model); they do **not** assert spec screens, so none of the above is
guarded by tests.

## Recommended fix order

1. **UX-26 + UX-25** — automatic evaluation + processing screen (restores the
   spec's core loop).
2. **UX-12 + UX-13 + UX-14** — pause/mute + correct voice states (the room's
   primary controls and feedback).
3. **UX-18** — text fallback (accessibility + resilience; §16/§42).
4. **UX-16 + UX-15** — conversation-first room + interview progress (spec §9/§11).
5. **UX-28 + UX-4 + UX-27** — spec dimension set, difficulty enum, results hero.
6. **UX-33 + UX-30 + UX-3** — Settings, transcript review, server-backed history.
7. **UX-5/6/7 + UX-11** — interview types, modes, voice/text choice, briefing.
8. Remaining Minor/Nit: UX-8/9/10, UX-17, UX-19/20/21/22/23/24, UX-29/31/32,
   UX-34/35/36/37/38/39.

Items 1–4 are the difference between an engineer's tool and the spec's
"professional interview practice environment" (§1).
