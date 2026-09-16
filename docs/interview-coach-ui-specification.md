# Interview Coach --- Complete UI Specification

> Product UI/UX specification for the Interview Coach application.
>
> This document describes the proposed end-to-end UI, including
> navigation, screens, interview flow, voice interaction, feedback,
> settings, and important UI states.
>
> Conventions: **MVP is DSA-only and voice-only.** Sections marked
> **v2-future** are explicitly out of the MVP and kept for later tracks.
> Backend scoring is canonical: overall 0-100 plus 7 dimensions x 0-5.
>
> Locked target: `prototypes/theme.css` plus one mockup per ritual-flow
> screen under `prototypes/` (`landing`, `onboarding`, `dashboard`,
> `lobby`, `live`, `evaluating`, `results`, `transcript`, `history`,
> `progress`, `weak-areas`, `settings`). Where this doc and a mockup
> disagree, the mockup wins and this doc must be amended.

------------------------------------------------------------------------

# 1. Product UI Vision

Interview Coach should feel like a **professional interview practice
environment**, not a generic chatbot.

The UI should make three things immediately clear:

1.  **What interview the candidate is practicing**
2.  **What is happening right now**
3.  **How well the candidate is performing**

The interface should stay visually quiet during an interview so the
candidate can focus on thinking and speaking.

The product should support both:

-   **Interview simulation** --- realistic interviewer behavior
-   **Coaching** --- hints, explanations, feedback, and improvement
    guidance

------------------------------------------------------------------------

# 2. Primary Application Structure

The application should use a simple application shell:

``` text
┌─────────────────────────────────────────────────────────────────┐
│ Interview Coach                              Profile / Settings │
├───────────────┬─────────────────────────────────────────────────┤
│               │                                                 │
│  Dashboard    │                                                 │
│  Interviews   │              Main Content                       │
│  History      │                                                 │
│  Progress     │                                                 │
│               │                                                 │
 │  Settings     │                                                 │
│               │                                                 │
└───────────────┴─────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 3. Navigation

Primary navigation (authenticated shell):

-   **Dashboard** (recommendation CTA + progress)
-   **Interview History**
-   **Progress** (includes weak areas)
-   **Settings**

There is no manual "New Interview" screen in the MVP: practice starts
from the server recommendation (Dashboard CTA -> Lobby). Pre-auth,
a public marketing landing page pitches the product and offers
sign-in / create-account, and first-run onboarding
captures role, level, and goals before the dashboard.

Optional future sections:

-   Question Bank
-   Saved Interviews
-   Learning Plan
-   Resume/Profile
-   Integrations

The navigation should remain minimal.

The candidate should be able to start a new interview in **one obvious
action**.

------------------------------------------------------------------------

# 4. Dashboard

The dashboard is the application's home screen.

## Purpose

Give the candidate a quick overview and provide an immediate path into
practice.

## Layout

``` text
┌───────────────────────────────────────────────────────────────┐
│ Interview Coach                                               │
│                                                               │
│ Learning loop                                                 │
│ Ready for your next interview?                 [ Edit goal ]  │
│                                                               │
│ Preparing for: Senior Backend Engineer · DSA    [ Update ]    │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Arrays · Move Zeroes  [Easy]                               │ │
│ │ One more success moves Arrays to developing.               │ │
│ │ [ Start practice ]  [ New suggestion ]                     │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ Curriculum progress                              18%          │
│  Foundations & Core Linear Structures      4 / 9 topics       │
│                                                               │
│ Strengths                    │  Focus areas                   │
│  Two-pointer structure       │  Complexity narration          │
│                                                               │
│ Topic mastery                                               │
│  Arrays        learning        2 / 3 attempts                  │
└───────────────────────────────────────────────────────────────┘
```
└───────────────────────────────────────────────────────────────┘
```

## Dashboard components

### Recommendation CTA

Primary CTA. Starts practice from the server recommendation
(`Start practice`) or asks for a fresh one (`New suggestion`).
There is no manual interview picker in the MVP.

### Curriculum progress

Module rows with per-topic counts plus a completion bar, derived from
server skill state.

### Performance summary

Show a small number of meaningful metrics rather than a large analytics
dashboard: overall score /100, strengths, and focus areas.

### Recent interviews

Display:

-   Problem and topic
-   Score (/100) and recommendation (`hire` / `lean_hire` / ...)
-   Date
-   Duration
-   Status
-   Review link

------------------------------------------------------------------------

# 5. New Interview Screen

> **v2-future.** Manual interview configuration was retired: the MVP starts
> practice from the server recommendation (Dashboard -> Lobby). Kept for a
> future where manual selection returns.

This screen configures an interview before starting.

## Layout

``` text
┌───────────────────────────────────────────────────────────────┐
│ ← Back                    New Interview                       │
│                                                               │
│ Interview Type                                                │
│                                                               │
│ ○ Coding                                                      │
│ ○ System Design                                               │
│ ○ Backend                                                      │
│ ○ Behavioral                                                   │
│ ○ Resume / Project Deep Dive                                  │
│                                                               │
│ Difficulty                                                    │
│                                                               │
│ ○ Easy       ● Medium       ○ Hard                            │
│                                                               │
│ Interview Style                                               │
│                                                               │
│ ● Realistic Interview                                         │
│ ○ Guided Coaching                                             │
│                                                               │
│ Voice                                                         │
│                                                               │
│ ● Voice       ○ Text                                          │
│                                                               │
│ Duration                                                      │
│                                                               │
│ 30 minutes                                                    │
│                                                               │
│                    [ Start Interview ]                        │
└───────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 6. Interview Types

> **MVP: DSA (Coding) only.** Every other track in this section is
> **v2-future**.

The initial UI should support:

### Coding / DSA (MVP)

Focus:

-   Algorithms
-   Data structures
-   Problem solving
-   Complexity
-   Code reasoning

### System Design (v2-future)

Focus:

-   Requirements
-   Architecture
-   Scalability
-   APIs
-   Data storage
-   Reliability
-   Trade-offs

### Backend (v2-future)

Focus:

-   APIs
-   Databases
-   Distributed systems
-   Caching
-   Messaging
-   Authentication
-   Reliability

### Behavioral (v2-future)

Focus:

-   Communication
-   Leadership
-   Ownership
-   Conflict
-   Decision making

### Resume / Project Deep Dive (v2-future)

The interviewer asks questions based on the candidate's projects and
experience.

------------------------------------------------------------------------

# 7. Interview Modes

## Realistic Interview

The AI behaves like an interviewer.

During this mode:

-   Minimal hints
-   No unnecessary explanations
-   Natural follow-up questions
-   Candidate controls the conversation
-   Feedback is primarily provided after the interview

This mode should feel as close as possible to a real interview.

## Guided Coaching

The AI can actively help.

The candidate can request:

-   Hint
-   Clarification
-   Explanation
-   Example
-   Feedback

The UI should make the difference between these modes obvious before
starting.

------------------------------------------------------------------------

# 8. Lobby (Interview Preparation)

The Lobby runs automated setup checks, installer-style: it fetches the
recommended problem, initializes the voice session, and requests microphone
permission, showing each step as it completes. The main interview screen
opens automatically as soon as every requirement is met.

``` text
┌───────────────────────────────────────────────────────────────┐
│Lobby                                     DSA · Easy · 30 min  │
│                                                               │
│Recommended practice                                           │
│Arrays · Move Zeroes (Easy)                                    │
│Why: continue current topic                                    │
│                                                               │
│Setup checks                                                   │
│[ok] Problem loaded                                            │
│[...] Microphone permission                                    │
│[ ] Voice session ready                                        │
│                                                               │
│The interview opens automatically once every check passes.     │
└───────────────────────────────────────────────────────────────┘
```

The checklist prevents accidental starts and sets expectations. Readiness is polled, never pre-minted: the voice-session mint fires at the transition into the interview, because minting auto-starts it server-side.

------------------------------------------------------------------------

# 9. Main Interview Screen

This is the most important screen in the product.

The UI should be intentionally minimal.

MVP notes: the header shows the DSA interview only. The problem pane shows
the title in the MVP; statement text and sample cases arrive later via
external lookup for the problem URL. The editor offers C++ / JS / Python
with per-problem boilerplate. One Test button runs the sample cases through
the sandbox (C++/JS/Python, properly isolated - never local execution, which
is retired on security grounds). There is no Submit button: the interviewer
has access to the candidate code and judges correctness conversationally.

## Desktop layout

``` text
┌────────────────────────────────────────────────────────────────────┐
│ DSA Interview · Easy                                 04:12   ● LIVE│
├───────────────────────────────────────┬────────────────────────────┤
│ Problem                               │ Editor    [C++ v]          │
│                                       │                            │
│ Move Zeroes                           │ /* boilerplate for the     │
│                                       │    problem appears here */ │
│                                       │                            │
│ Sample cases                          │                            │
│ case_1: in [0,1,0,3,12]               │                            │
│         out [1,3,12,0,0]              │                            │
│ case_2: in [0]  out [0]               │                            │
├───────────────────────────────────────┴────────────────────────────┤
│ [ Test sample cases ]                          [ End Interview ]   │
└────────────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 10. Interview Header

The header should show only important session information.

Display:

-   Interview type
-   Difficulty
-   Elapsed time
-   Connection/voice status
-   Session status

Example:

``` text
Backend Interview · Hard          18:42          ● LIVE
```

Avoid excessive information.

------------------------------------------------------------------------

# 11. Interview Conversation Area

> **Not applicable to the DSA MVP**: no visible conversation area. Whether
> other interview types show one is a future decision. The client still
> forwards voice transcript events to the backend silently, because
> server-side transcript persistence depends on it.

For voice interviews on future tracks, text transcripts should still be visible.

Example:

``` text
INTERVIEWER

Design a URL shortening service.
Start by telling me how you would approach
the problem.

CANDIDATE

I would first clarify the requirements...
```

The latest speaker should be visually emphasized.

The transcript should automatically scroll while preserving access to
previous messages.

------------------------------------------------------------------------

# 12. Voice Interaction

Voice is a core part of the experience.

## Voice states

The UI communicates voice state through an icon plus the voice indicator
(S13). There is no persistent text label of who is speaking; accessible
names live in tooltips and screen-reader labels.

| State | Icon | Notes |
|---|---|---|
| Connecting | hollow circle, pulsing | |
| Listening | filled dot | resting state |
| Candidate speaking | waveform bars animating with input amplitude | |
| AI thinking | spinner | |
| Interviewer speaking | speaker icon with radiating waves | |
| Error | warning triangle | offers Reconnect; reassure the session is safe |

There is no Paused state in the MVP (no pause control).

------------------------------------------------------------------------

# 13. Voice Indicator

The voice indicator should provide immediate feedback.

Possible design:

``` text
             ╭───────────╮
             │     ●     │
             │   ~~~~    │
             │  ~~~~~~   │
             ╰───────────╯

             Listening...
```

During speech, the waveform can react to audio amplitude.

Do not make the waveform excessively decorative.

Its purpose is to communicate state.

------------------------------------------------------------------------

# 14. Microphone Controls

The interview screen offers exactly one control:

-   End Interview (requires confirmation, S20)

There is no Mute / Pause / Resume and no secondary device or transcript
controls in the MVP. Microphone and speaker setup live in the Lobby checks
(S8); the AI voice type lives in Settings (S30).

------------------------------------------------------------------------

# 15. Interruptions

Voice interaction should support natural conversational interruption
where the underlying voice stack supports it.

Example:

``` text
INTERVIEWER:
"So the database would—"

CANDIDATE:
"Actually, before that..."
```

The UI should immediately communicate that the candidate has taken the
turn.

This is important for making the experience feel conversational rather
than like a voice recording.

------------------------------------------------------------------------

# 16. Text Fallback

> **Not in the MVP.** The app is voice-only: no text composer, no
> voice/text toggle. The content below is kept for a future track that
> needs it.

If voice is unavailable, the candidate should be able to switch to text.

``` text
┌───────────────────────────────────────────────────────────────┐
│ Type your response...                                        │
│                                                               │
│                                                   [ Send ]     │
└───────────────────────────────────────────────────────────────┘
```

The interview state should remain unchanged when switching between voice
and text.

------------------------------------------------------------------------

# 17. Interview Controls

The candidate has access to exactly one control:

### End

Ends the session (with confirmation) and opens the completion flow (S20).

There is no Pause, Transcript toggle, or in-interview Settings in the MVP.
Critical interview configuration is never changeable after the session
begins.

------------------------------------------------------------------------

# 18. Optional Coaching Panel

In Guided Coaching mode, provide a small coaching panel.

``` text
┌──────────────────────────────┐
│ Coaching                     │
│                              │
│ Need help?                   │
│                              │
│ [ Hint ]                     │
│ [ Clarify ]                  │
│ [ Think aloud ]              │
│ [ Feedback ]                 │
└──────────────────────────────┘
```

In Realistic Interview mode, these controls should either be hidden or
deliberately restricted.

------------------------------------------------------------------------

# 19. Interview Progress

> **v2-future.** Progress checklists are not applicable to DSA interviews.
> Kept for a future structured track.

For structured interviews, show progress.

Example:

``` text
Interview Progress

✓ Requirements
✓ API Design
● Architecture
○ Scalability
○ Reliability
```

The progress indicator should not reveal hidden evaluation criteria that
would make the interview artificially easier.

It should communicate session progress, not the answer.

------------------------------------------------------------------------

# 20. Ending an Interview

When the candidate selects End Interview:

``` text
┌───────────────────────────────────────────────────────────────┐
│ End interview?                                                │
│                                                               │
│ Your interview is currently 27 minutes long.                  │
│                                                               │
│ You can finish now and receive your evaluation.               │
│                                                               │
│ [ Continue Interview ]       [ End & Evaluate ]               │
└───────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 21. Evaluation Processing

After ending:

``` text
┌───────────────────────────────────────────────────────────────┐
│                    Analyzing Interview                         │
│                                                               │
│ Reviewing your responses...                                   │
│                                                               │
│ ✓ Technical reasoning                                         │
│ ✓ Communication                                                │
│ ✓ Problem solving                                              │
│ ◌ Generating feedback                                          │
│                                                               │
│ Please wait...                                                 │
└───────────────────────────────────────────────────────────────┘
```

Avoid displaying fake precision or unnecessary loading percentages.

------------------------------------------------------------------------

# 22. Interview Results

The results screen should be highly actionable.

## Layout

``` text
┌───────────────────────────────────────────────────────────────┐
│Interview Results                                              │
│DSA · Arrays · Easy · 12 min                                   │
│                                                               │
│                        72 / 100                               │
│                       proficient                              │
│                                                               │
│ problem_understanding  4     approach         4               │
│ communication          3     coding           4               │
│ testing_debugging      3     complexity       3               │
│ independence           2                                      │
│                                                               │
│What went well                                                 │
│                                                               │
│> Strong two-pointer structure                                 │
│                                                               │
│Improve next                                                   │
│                                                               │
│-> State the complexity before coding                          │
│                                                               │
│[ Review Interview ] [ Practice Weak Areas ]                   │
└───────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 23. Evaluation Categories

Scoring is backend-canonical and the UI renders it verbatim: overall
0-100 plus these 7 DSA dimensions, each 0-5 with evidence and feedback:

-   `problem_understanding`
-   `approach`
-   `communication`
-   `coding`
-   `testing_debugging`
-   `complexity_analysis`
-   `independence`

Future interview types may define their own dimension sets; the results
screen renders whatever keys the backend returns.

------------------------------------------------------------------------

# 24. Feedback Details

The candidate should be able to drill into feedback.

Example:

``` text
Communication — 3 / 5 (overall 72 / 100)

Strengths
─────────
You explained the API boundaries clearly.

Opportunities
─────────────
You jumped into implementation before clarifying
the edge cases.

Example improvement
───────────────────
Start by asking:

"What inputs can be empty here?"
```

Feedback should be specific and tied to actual interview moments.

------------------------------------------------------------------------

# 25. Transcript Review

The candidate can review the complete interview (server-captured
transcript, browser-forwarded and backend-validated).

``` text
18:32

INTERVIEWER
How would you handle database failures?

18:47

CANDIDATE
I would use replication...

19:12

INTERVIEWER
What happens if the primary and replica
temporarily disagree?
```

Important moments can be marked.

Potential labels:

-   Strong answer
-   Weak answer
-   Missed opportunity
-   Good follow-up
-   Important trade-off

------------------------------------------------------------------------

# 26. Interview History

The history page lists previous interviews (server-kept record; detail
views re-fetch canonical state). An empty state covers new accounts
("No interviews to show yet" + `Start practice`).

``` text
┌───────────────────────────────────────────────────────────────┐
│ Interview History                                             │
│                                                               │
│ Problem           Topic       Date     Score      Evaluation  │
│ Move Zeroes       Arrays      Sep 14   72 / 100   hire        │
│ Two Sum           Hash Map    Sep 11   64 / 100   lean_hire   │
│ Valid Anagram     Strings     Sep 09   48 / 100   lean_no_hire│
└───────────────────────────────────────────────────────────────┘
```

Filters:

-   Score
-   Date
-   Difficulty
-   Recommendation

------------------------------------------------------------------------

# 27. Progress Dashboard

The progress screen should answer:

> "Am I actually getting better?"

Show:

-   Overall trend
-   Interview-type performance
-   Strong areas
-   Weak areas
-   Recent improvement

Example:

``` text
Overall Performance

10 ┤
 9 ┤                    ●
 8 ┤          ●    ●    │
 7 ┤    ●  ●            │
 6 ┤ ●                   │
   └────────────────────────
     1  2  3  4  5  6  7
              Interviews
```

The goal is to emphasize **progress**, not gamification.

------------------------------------------------------------------------

# 28. Weak Areas

Recurring weak dimensions surface as practice cards, one dimension and
one problem per card:

``` text
Recommended practice

complexity_analysis · 2/5
State the cost before you code
Practice: Move Zeroes                      [ Practice ]

testing_debugging · 2/5
Probe the edges out loud
Practice: Two Sum                          [ Practice ]
```

The user should be able to start targeted practice directly from a weak
area.

------------------------------------------------------------------------

# 29. Practice Weak Area

Example:

``` text
Move Zeroes (Arrays · Easy)

Your recent weakness:
complexity_analysis — stated O(n) time only after prompting

Recommended practice:

[  Start Practice: Move Zeroes  ]

Focus:
• Stating time/space before coding
• Two-pointer discipline
• Empty/single-element inputs
```

This creates a loop:

**Interview → Feedback → Weak area → Targeted practice → New interview**

------------------------------------------------------------------------

# 30. Settings

Settings covers account, history, and session controls.

## Account

-   Display name and email
-   Role / level (links to profile editing)
-   Sign in / sign out / create account

## Interview history

-   Clear interview history (two-step confirm; deletes transcripts,
    evaluations, and derived skill state — never the curriculum catalog)

## Privacy

-   Transcript retention
-   Export data

------------------------------------------------------------------------

# 31. CLI Harness (Out of Scope)

> **Out of scope.** The CLI is an external regression harness, not this
> product's UI. It mirrors the same information architecture
> (recommendation -> lobby checks -> live voice -> evaluation ->
> results -> history) but ships no product screens; its key bindings
> are harness tooling, not specified here.

------------------------------------------------------------------------

# 34. Responsive Design

The application should support:

### Desktop

Two-column interview layout:

-   Conversation
-   Progress/coaching panel

### Tablet

Conversation remains primary.

Progress moves above or below the conversation.

### Mobile

Single-column layout:

``` text
Header
↓
Current interviewer message
↓
Voice indicator
↓
Conversation
↓
Controls
```

The candidate should never need to navigate through complex menus during
an interview.

------------------------------------------------------------------------

# 35. Visual Design Principles

The visual language should be:

-   Professional
-   Calm
-   Minimal
-   Technical
-   High readability
-   Low distraction

Avoid:

-   Excessive gradients
-   Gamification
-   Large decorative illustrations
-   Too many badges
-   Excessive animations

The interview screen should prioritize **attention and clarity**.

------------------------------------------------------------------------

# 36. Color Semantics

Color should communicate state consistently.

Examples:

-   Neutral → normal UI
-   Positive → successful/strong
-   Warning → needs attention
-   Error → failure
-   Active → currently speaking/listening

Do not rely solely on color.

Pair state colors with:

-   Icons
-   Labels
-   Text
-   Position

This ensures accessibility.

------------------------------------------------------------------------

# 37. Typography

Prioritize readability.

Recommended hierarchy:

``` text
Page title
  ↓
Section heading
  ↓
Interviewer message
  ↓
Candidate message
  ↓
Supporting metadata
```

The current speaker should have stronger visual emphasis than historical
content.

------------------------------------------------------------------------

# 38. Animation

Animation should be functional.

Useful animations:

-   Voice waveform
-   Listening indicator
-   Transition into interview
-   AI thinking state
-   Progress changes

Avoid decorative animation during active interviewing.

------------------------------------------------------------------------

# 39. Error States

The application should provide clear recovery actions.

### Voice connection error

``` text
Voice connection lost.

Your interview session is safe.

[ Reconnect ]   [ Switch to Text ]
```

### Model/API error

``` text
The interviewer is temporarily unavailable.

[ Retry ]   [ Switch Model ]
```

### Authentication error

``` text
Authentication expired.

[ Sign In Again ]
```

### Session recovery

If the application crashes:

``` text
A previous interview session was found.

[ Resume ]   [ Discard ]
```

------------------------------------------------------------------------

# 40. Empty States

### No interview history

``` text
No interviews yet.

Your first practice session will appear here.

[ Start Your First Interview ]
```

### No progress data

``` text
Complete a few interviews to see
your performance trends.
```

------------------------------------------------------------------------

# 41. Loading States

Loading states should explain what is happening.

Bad:

``` text
Loading...
```

Better:

``` text
Preparing your interview...
```

or:

``` text
Connecting to interviewer...
```

or:

``` text
Analyzing your responses...
```

------------------------------------------------------------------------

# 42. Accessibility

The UI should support:

-   Keyboard navigation
-   Screen readers
-   Clear focus states
-   Sufficient text contrast
-   Captions/transcripts
-   Text fallback for voice
-   Non-color state indicators
-   Adjustable text size where practical

Voice must never be the only way to interact with the product.

------------------------------------------------------------------------

# 43. Core User Journey

The primary journey should be:

``` text
Landing
   ↓
Sign-in -> Onboarding (role, level, goals)
   ↓
Dashboard (recommended next)
   ↓
Lobby (automated checks)
   ↓
Live voice interview (End is the only control)
   ↓
Evaluating (async scoring)
   ↓
Results (/100 + 7 x /5)
   ↓
Transcript review / Detailed feedback
   ↓
History / Progress / Weak areas
   ↓
Targeted practice
   ↓
Next recommendation
```

This loop is the heart of the product.

------------------------------------------------------------------------

# 44. MVP UI Scope

The first version should avoid building every screen immediately.

### MVP screens

1.  Landing (public marketing page: pitch, scoring proof, CTAs)
2.  Onboarding (role, level, goals; pre-auth cached locally)
3.  Dashboard (recommendation CTA, curriculum progress)
4.  Lobby with automated setup checks
5.  DSA interview screen (problem + editor)
6.  Voice states (icon indicator)
7.  End control + confirmation
8.  Evaluation/loading
9.  Results (overall /100, 7 dimensions x /5)
10. Transcript review
11. Server-backed interview history
12. Progress + weak areas
13. Settings (account, clear history, sign-out)

### Defer

-   Advanced progress analytics
-   Learning plans
-   Question marketplace
-   Social features
-   Gamification
-   Resume management
-   Complex personalization
-   Manual interview configuration (v2-future)
-   Text fallback / text mode
-   Non-DSA interview tracks (v2-future)

------------------------------------------------------------------------

# 45. UI Architecture Principle

The UI should be driven by **interview state**, not by individual
components independently.

Conceptually:

``` text
Interview Session State
        │
        ├── Current question
        ├── Conversation
        ├── Speaker
        ├── Voice state
        ├── Interview phase
        ├── Timer
        ├── Mode
        ├── Progress
        └── Evaluation state
                 │
                 ▼
              UI Layer
```

This makes the voice UI and web UI easier to keep
consistent.

------------------------------------------------------------------------

# 46. Important State Model

The UI should distinguish at least these states:

``` text
IDLE
  ↓
CONFIGURING
  ↓
READY
  ↓
CONNECTING
  ↓
LISTENING
  ↓
USER_SPEAKING
  ↓
THINKING
  ↓
AI_SPEAKING
  ↓
LISTENING
```

Other states:

``` text
PAUSED
ENDING
EVALUATING
COMPLETED
ERROR
```

The same state model drives the voice interface.

------------------------------------------------------------------------

# 47. Design Principle for AI Interaction

The UI should never make the AI feel like a generic chat assistant.

Instead, it should communicate a clear role:

``` text
                INTERVIEWER
                    │
                    ▼
              asks question
                    │
                    ▼
               CANDIDATE
                    │
                    ▼
               responds
                    │
                    ▼
             INTERVIEWER
                    │
                    ▼
              follows up
```

The interaction loop should remain interview-oriented.

------------------------------------------------------------------------

# 48. Final Product Experience

The ideal experience is:

> Open Interview Coach → start from your recommended next interview →
> speak naturally → receive realistic follow-ups → finish → understand
> exactly what went well and what to improve → immediately practice
> the weak areas.

The UI should make that loop **fast, calm, and obvious**.

The product's strongest differentiator should be the quality of the
**interview interaction and feedback**, not visual complexity.
