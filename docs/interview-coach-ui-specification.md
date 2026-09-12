# Interview Coach --- Complete UI Specification

> Product UI/UX specification for the Interview Coach application.
>
> This document describes the proposed end-to-end UI, including
> navigation, screens, interview flow, voice interaction, feedback,
> settings, and important UI states.

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

For the CLI-first implementation, the same information architecture
should exist conceptually even if the visual presentation is
terminal-based.

------------------------------------------------------------------------

# 3. Navigation

Primary navigation:

-   **Dashboard**
-   **New Interview**
-   **Interview History**
-   **Progress**
-   **Settings**

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
│ Good afternoon                                                │
│ Ready for your next interview?                                │
│                                                               │
│ ┌──────────────────────┐  ┌────────────────────────────────┐ │
│ │  Start Interview     │  │  Continue Practice             │ │
│ │                      │  │                                │ │
│ │  Choose interview →  │  │  Last session: System Design   │ │
│ └──────────────────────┘  └────────────────────────────────┘ │
│                                                               │
│ Recent Performance                                            │
│                                                               │
│  Overall        Problem Solving       Communication           │
│    7.8/10            8.2/10               7.4/10             │
│                                                               │
│ Recent Interviews                                             │
│                                                               │
│  System Design     8.1/10     Today                           │
│  Coding            7.4/10     Yesterday                      │
│  Backend API       8.3/10     Sep 9                          │
└───────────────────────────────────────────────────────────────┘
```

## Dashboard components

### Start Interview

Primary CTA.

Clicking it opens the interview configuration screen.

### Continue Practice

Appears when an unfinished or recent session exists.

### Performance summary

Show a small number of meaningful metrics rather than a large analytics
dashboard.

### Recent interviews

Display:

-   Interview type
-   Score
-   Date
-   Duration
-   Status

------------------------------------------------------------------------

# 5. New Interview Screen

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

The initial UI should support:

### Coding

Focus:

-   Algorithms
-   Data structures
-   Problem solving
-   Complexity
-   Code reasoning

### System Design

Focus:

-   Requirements
-   Architecture
-   Scalability
-   APIs
-   Data storage
-   Reliability
-   Trade-offs

### Backend

Focus:

-   APIs
-   Databases
-   Distributed systems
-   Caching
-   Messaging
-   Authentication
-   Reliability

### Behavioral

Focus:

-   Communication
-   Leadership
-   Ownership
-   Conflict
-   Decision making

### Resume / Project Deep Dive

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

# 8. Interview Preparation Screen

Before the interview begins, show a short briefing.

``` text
┌───────────────────────────────────────────────────────────────┐
│                     Interview Ready                           │
│                                                               │
│ Backend Engineering Interview                                 │
│ Difficulty: Hard                                              │
│ Duration: 45 minutes                                          │
│ Mode: Realistic Interview                                     │
│                                                               │
│ You will be evaluated on:                                     │
│                                                               │
│ • Problem solving                                              │
│ • Technical depth                                              │
│ • Communication                                                │
│ • Trade-off analysis                                           │
│                                                               │
│ The interviewer may interrupt with follow-up questions.       │
│                                                               │
│              [ Begin Interview ]                              │
└───────────────────────────────────────────────────────────────┘
```

This screen prevents accidental interview starts and sets expectations.

------------------------------------------------------------------------

# 9. Main Interview Screen

This is the most important screen in the product.

The UI should be intentionally minimal.

## Desktop layout

``` text
┌────────────────────────────────────────────────────────────────────┐
│ Backend Interview                           18:42 elapsed   ● LIVE │
├───────────────────────────────────────┬────────────────────────────┤
│                                       │                            │
│ Interviewer                           │ Interview Progress         │
│                                       │                            │
│ "Design a URL shortening service.    │  ● Requirements            │
│  Let's start with the requirements." │  ● API                      │
│                                       │  ○ Architecture              │
│                                       │  ○ Scaling                   │
│                                       │                            │
│                                       │                            │
│                                       │                            │
│                                       │                            │
│                                       │                            │
│                                       │                            │
│                                       │                            │
│                                       │                            │
│                                       │                            │
│                                       │                            │
│                                       │                            │
├───────────────────────────────────────┴────────────────────────────┤
│                                                                    │
│                     ● Listening                                     │
│                                                                    │
│                       🎙                                            │
│                                                                    │
│ [ Mute ]  [ Pause ]                       [ End Interview ]         │
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

The conversation area is the primary focus.

For voice interviews, text transcripts should still be visible.

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

The UI should clearly distinguish:

### Connecting

``` text
○ Connecting...
```

### Listening

``` text
● Listening
```

### User speaking

``` text
● You're speaking
```

### AI thinking

``` text
◌ Thinking...
```

### AI speaking

``` text
● Interviewer speaking
```

### Paused

``` text
Ⅱ Interview paused
```

### Error

``` text
! Voice connection lost
[ Reconnect ]
```

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

Primary controls:

-   Mute / Unmute
-   Pause / Resume
-   End Interview

Secondary controls can include:

-   Change input device
-   Change output device
-   Toggle transcript

The **End Interview** action should require confirmation.

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

The candidate should have access to:

### Pause

Temporarily stops the interview.

### End

Ends the session and opens the completion flow.

### Transcript

Shows/hides the conversation transcript.

### Settings

Allows safe changes such as:

-   Audio device
-   Voice volume
-   Transcript visibility

Critical interview configuration should not be casually changeable after
the session begins.

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
│ Interview Results                                             │
│ Backend Engineering · Hard · 32 min                           │
│                                                               │
│                        8.1 / 10                               │
│                         Strong                                │
│                                                               │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│ │ Technical  │ │ Problem    │ │ Communi-   │ │ Trade-offs  │ │
│ │  8.5       │ │ Solving    │ │ cation     │ │  7.6       │ │
│ │             │ │  8.2       │ │  7.9       │ │             │ │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│                                                               │
│ What went well                                                │
│                                                               │
│ ✓ Strong API reasoning                                        │
│ ✓ Good scalability discussion                                 │
│                                                               │
│ Improve next                                                  │
│                                                               │
│ → Explain consistency trade-offs more clearly                 │
│ → Discuss failure handling earlier                             │
│                                                               │
│ [ Review Interview ] [ Practice Weak Areas ]                   │
└───────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 23. Evaluation Categories

The exact scoring system can evolve, but the UI should support
categories such as:

-   Technical correctness
-   Problem solving
-   System design
-   Communication
-   Trade-off analysis
-   Depth of knowledge
-   Code quality
-   Requirement clarification

Not every interview type needs every category.

------------------------------------------------------------------------

# 24. Feedback Details

The candidate should be able to drill into feedback.

Example:

``` text
Communication — 7.9 / 10

Strengths
─────────
You explained the API boundaries clearly.

Opportunities
─────────────
You jumped into implementation before clarifying
the expected traffic.

Example improvement
───────────────────
Start by asking:

"What scale are we designing for?"
```

Feedback should be specific and tied to actual interview moments.

------------------------------------------------------------------------

# 25. Transcript Review

The candidate can review the complete interview.

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

The history page provides a searchable list of previous interviews.

``` text
┌───────────────────────────────────────────────────────────────┐
│ Interview History                                             │
│                                                               │
│ Search interviews...                     Filter ▼             │
│                                                               │
│ Today                                                         │
│ ───────────────────────────────────────────────────────────── │
│ Backend Engineering     8.1/10      32 min      Review →      │
│                                                               │
│ Yesterday                                                      │
│ ───────────────────────────────────────────────────────────── │
│ Coding                  7.4/10      41 min      Review →      │
│                                                               │
│ Sep 9                                                          │
│ ───────────────────────────────────────────────────────────── │
│ System Design           8.3/10      38 min      Review →      │
└───────────────────────────────────────────────────────────────┘
```

Filters:

-   Interview type
-   Score
-   Date
-   Difficulty
-   Mode

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

Example:

``` text
Areas to Improve

System Design
████████░░  8.0

Distributed Systems
██████░░░░  6.4   ← Focus area

Communication
████████░░  7.8

Database Design
███████░░░  7.1
```

The user should be able to start targeted practice directly from a weak
area.

------------------------------------------------------------------------

# 29. Practice Weak Area

Example:

``` text
Distributed Systems

Your recent weakness:
Failure handling and consistency trade-offs

Recommended practice:

[ 15-minute focused interview ]

Focus:
• Replication
• Consistency
• Failure modes
• Recovery

[ Start Practice ]
```

This creates a loop:

**Interview → Feedback → Weak area → Targeted practice → New interview**

------------------------------------------------------------------------

# 30. Settings

Settings should be organized into sections.

## General

-   Theme
-   Language
-   Notifications
-   Default interview duration

## Voice

-   Microphone
-   Speaker
-   Voice
-   Volume
-   Input sensitivity
-   Test microphone

## Interview

-   Default mode
-   Default difficulty
-   Automatic transcript
-   Feedback preferences

## AI

-   Provider
-   Model
-   Endpoint
-   Advanced model configuration

AI settings should be hidden or simplified for normal users if the
product later targets non-technical users.

## Privacy

-   Transcript retention
-   Delete interview history
-   Export data

------------------------------------------------------------------------

# 31. CLI UI

The CLI should follow the same product information architecture.

Example:

``` text
$ interview-coach

╭──────────────────────────────────────╮
│          INTERVIEW COACH             │
│                                      │
│  Practice like it's the real thing.  │
╰──────────────────────────────────────╯

  1. Start interview
  2. Continue interview
  3. Interview history
  4. Progress
  5. Settings
  6. Exit

Select an option:
```

------------------------------------------------------------------------

# 32. CLI Interview Screen

Example:

``` text
╭────────────────────────────────────────────────────────────╮
│ BACKEND INTERVIEW                         18:42   ● LIVE    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ INTERVIEWER                                                │
│                                                            │
│ Design a URL shortening service.                           │
│ Start by clarifying the requirements.                      │
│                                                            │
│ CANDIDATE                                                  │
│                                                            │
│ I would first ask about expected traffic...                │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ ● Listening                                                 │
│                                                            │
│ [M] Mute   [P] Pause   [T] Transcript   [Q] End            │
╰────────────────────────────────────────────────────────────╯
```

Keyboard commands should be easy to discover.

------------------------------------------------------------------------

# 33. CLI Keyboard Controls

Suggested controls:

  Key     Action
  ------- ----------------------
  `M`     Mute/unmute
  `P`     Pause/resume
  `T`     Toggle transcript
  `H`     Help
  `Q`     End interview
  `Esc`   Close current dialog

Do not overload keys with multiple meanings.

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
Dashboard
   ↓
New Interview
   ↓
Choose Interview Type
   ↓
Choose Difficulty
   ↓
Choose Mode
   ↓
Interview Briefing
   ↓
Start Interview
   ↓
Voice/Text Conversation
   ↓
End Interview
   ↓
AI Evaluation
   ↓
Results
   ↓
Detailed Feedback
   ↓
Weak Areas
   ↓
Targeted Practice
   ↓
Next Interview
```

This loop is the heart of the product.

------------------------------------------------------------------------

# 44. MVP UI Scope

The first version should avoid building every screen immediately.

### MVP screens

1.  Start/New Interview
2.  Interview screen
3.  Voice states
4.  Text transcript
5.  Pause/end controls
6.  Evaluation/loading
7.  Results
8.  Basic interview history
9.  Settings

### Defer

-   Advanced progress analytics
-   Learning plans
-   Question marketplace
-   Social features
-   Gamification
-   Resume management
-   Complex personalization

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

This makes the voice UI, CLI, and future web UI easier to keep
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

The same state model should be usable by both voice and text interfaces.

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

> Open Interview Coach → choose an interview → start → speak naturally →
> receive realistic follow-ups → finish → understand exactly what went
> well and what to improve → immediately practice the weak areas.

The UI should make that loop **fast, calm, and obvious**.

The product's strongest differentiator should be the quality of the
**interview interaction and feedback**, not visual complexity.
