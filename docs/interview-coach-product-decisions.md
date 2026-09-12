# Interview Coach --- Product Decisions

> Consolidated product decisions available from the Interview Coach
> project context as of September 12, 2026.
>
> This document captures decisions and constraints that have been
> established in the project conversations. It intentionally
> distinguishes confirmed decisions from items that were discussed but
> not conclusively decided.

------------------------------------------------------------------------

## 1. Product

### Product name

**Interview Coach**

### Product purpose

Build an interview-coaching tool focused on helping a software engineer
prepare for and perform better in technical interviews.

### Primary user

A software engineer preparing for backend/software-engineering
interviews.

### Primary use cases

-   Interview preparation
-   Technical interview practice
-   Interactive coaching
-   CLI-based interview coaching
-   Real-time voice interaction
-   AI-assisted feedback and guidance

------------------------------------------------------------------------

## 2. Target Interview Profile

The product should be optimized primarily for **software engineering
interviews**, with particular relevance to:

-   Backend engineering
-   General software engineering
-   System/design-oriented technical interviews
-   Coding/problem-solving interviews
-   Technical communication

The user's own preparation is currently oriented toward **backend
roles**, so backend-oriented interview scenarios are an important
initial focus.

------------------------------------------------------------------------

## 3. Product Experience

### CLI-first direction

A **CLI interface** is an important part of the product.

The CLI should support an efficient workflow for: - Starting an
interview/coaching session - Selecting/configuring an interview mode -
Interacting with the coach - Receiving coaching/feedback - Using AI
models for the session

### Voice interaction

The project is also being developed around **Azure Voice Live**,
indicating that real-time voice interaction is part of the product
direction.

The voice experience should make the coach feel interactive rather than
simply acting as a text-based question generator.

------------------------------------------------------------------------

## 4. AI / Model Strategy

### Model selection should be deliberate

The project has explicitly considered which model should power the
Interview Coach CLI.

The model should be selected based on the needs of an interview coach
rather than simply choosing the most powerful or most expensive
available model.

Important factors include: - Reasoning quality - Response latency -
Conversational quality - Context handling - Cost - Reliability -
Suitability for real-time interaction

### Provider constraints

The product should **not depend on GitHub Copilot provider models**,
because the user does not currently have a GitHub Copilot subscription
that would make those models available.

### Azure / Foundry

The project can use models deployed through **Azure AI
Foundry/Azure-hosted model endpoints**.

The user has experimented with multiple model families and deployments,
including GPT-5.x and other providers, but model selection should remain
an explicit product decision rather than coupling the application to one
provider unnecessarily.

------------------------------------------------------------------------

## 5. Voice Architecture

### Azure Voice Live

**Azure Voice Live** is being used/considered for the voice experience.

A recent project decision involved the **two Azure roles required for
Voice Live**. The implementation should preserve the principle of
granting only the permissions required by the application and avoid
unnecessarily broad Azure permissions.

> Exact role names should be verified against the current Azure Voice
> Live documentation before being treated as a permanent infrastructure
> specification, because Azure role definitions can change.

------------------------------------------------------------------------

## 6. Coaching Philosophy

The coach should be more than a question-and-answer bot.

The intended experience is an **interviewer + coach** that can: - Ask
appropriate interview questions - Let the candidate reason through an
answer - Follow up based on the candidate's response - Challenge weak
assumptions - Ask clarifying questions - Evaluate the response - Provide
useful feedback - Help the candidate improve

The system should avoid prematurely giving the solution when the goal is
to simulate an actual interview.

------------------------------------------------------------------------

## 7. Interview Simulation vs Coaching

The product should distinguish between:

### Interview mode

The AI behaves primarily like an interviewer: - Ask questions - Ask
follow-ups - Probe reasoning - Avoid unnecessary hints - Maintain
realistic interview flow

### Coaching/feedback mode

The AI can: - Explain weaknesses - Suggest improvements - Identify
missing areas - Give hints - Explain better approaches - Provide a
post-interview assessment

This separation is important because giving too much assistance during
an interview simulation undermines the value of the simulation.

------------------------------------------------------------------------

## 8. Session Context

An interview session should maintain enough context to make follow-up
questions meaningful.

The coach should understand: - The current interview question - The
candidate's previous responses - Questions already asked -
Feedback/observations accumulated during the session - The current
interview stage - The intended interview type

The architecture should therefore support **stateful sessions**, rather
than treating every user message as an isolated request.

------------------------------------------------------------------------

## 9. Real-Time Interaction

For voice conversations, latency is an important product requirement.

The system should prioritize: - Fast turn-taking - Natural
conversational flow - Interruptibility where supported - Concise spoken
responses - Avoiding long model-generated monologues

Voice responses should generally be optimized for listening rather than
simply reading a text response aloud.

------------------------------------------------------------------------

## 10. Product Quality Priorities

The product should prioritize:

1.  **Correct and useful coaching**
2.  **Natural interview interaction**
3.  **Low enough latency for conversation**
4.  **Reliable session state**
5.  **Good feedback quality**
6.  **Reasonable model/API cost**
7.  **Simple developer experience**

The product should favor robust engineering and quality over rushing
features.

------------------------------------------------------------------------

## 11. Engineering Direction

The project should remain modular enough to change: - LLM provider -
Model - Voice provider/integration - Interview strategy - UI/CLI layer

without requiring a complete rewrite.

Provider-specific integrations should ideally be isolated behind
application-level interfaces.

------------------------------------------------------------------------

## 12. Configuration

Model/provider configuration should be externalized rather than
hard-coded.

The application should be able to configure: - Provider - Model -
Endpoint - Authentication - Voice configuration - Interview mode - Other
runtime behavior

This makes experimentation with different models practical.

------------------------------------------------------------------------

## 13. Security

The product should follow least-privilege principles for cloud
permissions.

Important security principles: - Do not hard-code secrets - Keep API
credentials out of source control - Use appropriate Azure
identity/authentication mechanisms - Assign only required Azure roles -
Avoid granting broad subscription/resource permissions when narrower
permissions are sufficient

------------------------------------------------------------------------

## 14. Current Development Context

The project has included work/research around: - Azure Voice Live -
Azure AI Foundry - Multiple LLM providers - CLI-based Interview Coach -
Model selection - Backend/interview preparation

The user is also building the project while preparing for backend
software-engineering interviews, so the product should remain practical
as both a usable coaching tool and an engineering project.

------------------------------------------------------------------------

## 15. Decisions vs Discussions

The following should **not** be treated as final product decisions
unless explicitly confirmed later:

-   A single permanent LLM model
-   A single permanent voice provider beyond the current Azure Voice
    Live direction
-   Exact Azure RBAC role names without checking the current Azure
    documentation
-   A final UI beyond the CLI direction
-   A finalized pricing/business model
-   A finalized persistence/database technology
-   A finalized deployment architecture
-   A finalized evaluation/scoring algorithm

These have either been explored or remain implementation choices rather
than confirmed product decisions.

------------------------------------------------------------------------

## 16. Decision Log

  -----------------------------------------------------------------------
  Area                    Decision                Status
  ----------------------- ----------------------- -----------------------
  Product                 Build Interview Coach   Confirmed

  Primary audience        Software engineers      Confirmed
                          preparing for           
                          interviews              

  Role focus              Backend/software        Confirmed
                          engineering             

  Interface               CLI is a key product    Confirmed
                          interface               

  Voice                   Real-time voice         Confirmed
                          experience is part of   
                          the direction           

  Voice platform          Azure Voice Live        Current direction

  AI provider             Must not depend on      Constraint
                          GitHub Copilot provider 
                          models                  

  AI hosting              Azure/Foundry is        Current direction
                          available as a          
                          model-hosting option    

  Model selection         Choose based on         Confirmed principle
                          reasoning, latency,     
                          quality and cost        

  Interview simulation    Separate interviewer    Confirmed principle
                          behavior from coaching  
                          behavior                

  Session                 Maintain state across   Confirmed principle
                          an interview            

  Voice UX                Optimize responses for  Confirmed principle
                          natural spoken          
                          interaction             

  Architecture            Keep provider           Confirmed principle
                          integrations            
                          replaceable             

  Security                Use least privilege     Confirmed principle

  Secrets                 Do not hard-code        Confirmed principle
                          credentials             
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 17. Open Product Decisions

These are useful candidates for the next product-decision pass:

### Interview types

-   Coding interview
-   System design
-   Behavioral interview
-   Backend/API design
-   Debugging
-   Resume/project deep dive

### Scoring

Define a consistent scoring model for: - Correctness - Problem solving -
Communication - System design - Trade-off analysis - Code quality -
Interview confidence/clarity

### Feedback timing

Decide whether feedback is: - Only after the interview - Available on
request - Given continuously - Configurable by mode

### Session persistence

Decide what should persist between sessions: - Interview history -
Scores - Weak areas - Questions - User profile/preferences

### Evaluation

Define how the system measures whether the coaching actually improves
interview performance.

------------------------------------------------------------------------

## 18. Product Principle

The core product principle is:

> **Simulate a realistic interview when the candidate is practicing,
> then provide high-quality coaching that helps them improve.**

The system should feel like an intelligent interview partner---not
merely an LLM wrapped in a CLI.

------------------------------------------------------------------------

## Notes

This document is a consolidation of the Interview Coach decisions
available in the project context. Where earlier discussions explored
alternatives without a final selection, they are intentionally marked as
current direction, principle, constraint, or open decision rather than
being presented as confirmed architecture.
