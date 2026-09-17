// Landing (feature 17a): public sales pitch on the approved prototype.
// Entry points (sign in / create account / dev guest) keep their existing
// callbacks; the screen makes no backend calls.

import {
  MarketingFinal,
  MarketingFooter,
  MarketingHero,
  MarketingPillars,
  MarketingQuote,
  MarketingScorecard,
  MarketingSection,
  MarketingSteps,
  MarketingTopbar,
  type MarketingNavLink,
} from "../components/Marketing.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";

const NAV_LINKS: readonly MarketingNavLink[] = [
  { href: "#how", label: "How it works" },
  { href: "#scoring", label: "Scoring" },
  { href: "#why", label: "Why it works" },
];

const SCORE_ROWS = [
  { name: "problem_understanding", value: "4 / 5" },
  { name: "approach", value: "4 / 5" },
  { name: "coding", value: "4 / 5" },
  { name: "independence", value: "2 / 5" },
] as const;

const PILLARS = [
  {
    glyph: (
      <span className="g-bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    ),
    title: "Voice-only. Like the real room.",
    text: "No text composer to hide behind. You think out loud under time pressure, exactly as the job demands.",
  },
  {
    glyph: <>7/5</>,
    title: "7 dimensions, scored with evidence.",
    text: "Each dimension gets 0-5 plus the moment that earned it. Never a black-box number.",
  },
  {
    glyph: "\u21BB",    title: "Adaptive loop. Every session picks the next one.",
    text: "Master a topic and move on. Struggle and it holds you there until the weakness clears.",
  },
] as const;

const WHY_CARDS = [
  {
    title: "A real interviewer, not a chatbot",
    text: "Timed voice sessions with natural follow-ups, interruptions handled gracefully, and pressure that feels familiar on the day that counts.",
  },
  {
    title: "Scores you can act on",
    text: "Overall /100 plus 7 validated dimensions with evidence tied to actual moments \u2014 not vibes. You always know the single next thing to fix.",
  },
  {
    title: "A loop that adapts to you",
    text: "Master a topic and the curriculum moves on. Struggle and it holds you there with targeted practice until the weakness is gone.",
  },
] as const;

const STEPS = [
  {
    title: "Get your recommendation",
    text: "Your dashboard tells you exactly what to practice next \u2014 topic, problem, and why.",
  },
  {
    title: "Clear lobby checks",
    text: "Mic and voice session verified automatically. The interview opens itself when everything is green.",
  },
  {
    title: "Interview out loud",
    text: "One problem, voice only. Talk through your approach, code live, handle the follow-ups. End is the only button.",
  },
  {
    title: "Get the debrief",
    text: "Structured scores, strengths, focus areas, and a practice card for your weakest dimension \u2014 feeding your next session.",
  },
] as const;

export function LandingScreen({
  onSignIn,
  onCreateAccount,
  onDevGuest,
  showDevGuest,
}: {
  readonly onSignIn: () => void;
  readonly onCreateAccount: () => void;
  readonly onDevGuest: () => void;
  readonly showDevGuest: boolean;
}) {
  return (
    <div className="landing-shell">
      <MarketingTopbar
        navLinks={NAV_LINKS}
        actions={
          <>
            <GhostButton onClick={onSignIn}>Sign in</GhostButton>
            <PrimaryButton onClick={onCreateAccount}>Create account</PrimaryButton>
          </>
        }
      />

      <main className="landing-main">
        <MarketingHero
          eyebrow="Voice-led DSA interview practice"
          title={
            <>
              Stop rehearsing answers. <em>Start surviving interviews.</em>
            </>
          }
          subtitle={"Reading solutions feels like progress until a real interviewer says \u201Cwalk me through your thinking\u201D and your mind goes blank. Interview Coach fixes that: timed voice interviews on a real curriculum, an interviewer that pushes back, and scoring that tells you exactly what to fix next."}
          actions={
            <>
              <PrimaryButton onClick={onCreateAccount}>Start practicing free</PrimaryButton>
              <a className="btn-ghost as-link" href="#scoring">
                See how scoring works
              </a>
              {showDevGuest && (
                <GhostButton onClick={onDevGuest}>Continue without signing in (dev)</GhostButton>
              )}
            </>
          }
          fine={"Free to start \u00B7 No credit card \u00B7 Your first scored interview in under 10 minutes."}
          scorecard={
            <MarketingScorecard
              badge="Sample results"
              score="72"
              of="100"
              meta={"Move Zeroes \u00B7 Arrays \u00B7 Easy \u00B7 12 min"}
              rows={SCORE_ROWS}
            />
          }
        />

        <MarketingPillars items={PILLARS} />

        <MarketingSection
          id="why"
          eyebrow="Why it works"
          title="Interviews test performance, not knowledge"
          lede="Knowing the algorithm is table stakes. Offers go to candidates who think out loud, handle follow-ups, and stay composed. That is a performance skill, and performance skills only improve under performance conditions."
        >
          <div className="grid3">
            {WHY_CARDS.map((card) => (
              <div key={card.title} className="card">
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </div>
            ))}
          </div>
        </MarketingSection>

        <MarketingSection
          id="how"
          eyebrow="How a session runs"
          title="From dashboard to debrief in 30 minutes"
          lede="Four steps, one loop: every session ends with a practice card that feeds the next recommendation."
        >
          <MarketingSteps steps={STEPS} />
          <MarketingQuote caption={"Dummy testimonial placeholder \u2014 replace with a real user quote before launch."}>
            {"\u201CI stopped blanking on \u2018any questions about edge cases?\u2019 after the third session.\u201D"}
          </MarketingQuote>
        </MarketingSection>

        <MarketingFinal
          title="Your next interview is already scheduled. By you."
          subtitle="Create an account, tell us your role and level, and get your first recommendation in minutes."
          actions={
            <>
              <PrimaryButton onClick={onCreateAccount}>Create account</PrimaryButton>
              <GhostButton onClick={onSignIn}>Sign in</GhostButton>
            </>
          }
        />
      </main>

      <MarketingFooter>
        <span className="footer-brand">Interview Coach</span>
        <span>DSA-only MVP</span>
        <span>Voice-only interviews</span>
        <span>Structured scoring</span>
      </MarketingFooter>
    </div>
  );
}
