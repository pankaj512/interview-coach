// Marketing primitives (feature 17a): public landing sections on the
// approved prototype look. Shared pitch copy lives here so the landing page
// and the auth side panel render the same words; screen-specific copy stays
// in the screens.

import { useEffect, useRef, type ReactNode } from "react";

export interface MarketingNavLink {
  readonly href: string;
  readonly label: string;
}

export function MarketingTopbar({
  navLinks,
  actions,
  onBrandClick,
}: {
  readonly navLinks: readonly MarketingNavLink[];
  readonly actions: ReactNode;
  readonly onBrandClick: () => void;
}) {
  return (
    <header className="landing-topbar">
      <div className="landing-topbar-inner">
        <button type="button" className="brand" onClick={onBrandClick}>
          Interview Coach
        </button>
        <nav className="landing-nav" aria-label="Product">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="landing-nav-actions">{actions}</div>
      </div>
    </header>
  );
}

export function MarketingHero({
  eyebrow,
  title,
  subtitle,
  actions,
  fine,
  scorecard,
}: {
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly subtitle: string;
  readonly actions: ReactNode;
  readonly fine: ReactNode;
  readonly scorecard: ReactNode;
}) {
  return (
    <section className="landing-hero" id="start">
      <div className="landing-hero-inner">
        <div className="hero-content">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="sub">{subtitle}</p>
          <div className="cta">{actions}</div>
          <p className="fine">{fine}</p>
        </div>
        {scorecard}
      </div>
    </section>
  );
}

export function MarketingScorecard({
  badge,
  score,
  of,
  meta,
  rows,
}: {
  readonly badge: string;
  readonly score: string;
  readonly of: string;
  readonly meta: string;
  readonly rows: readonly { readonly name: string; readonly value: string }[];
}) {
  return (
    <div className="scorecard" id="scoring">
      <div className="topline">
        <span className="badge">{badge}</span>
      </div>
      <div className="bignum">
        {score}
        <small> / {of}</small>
      </div>
      <p className="scorecard-meta">{meta}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.name}>
            <span>{row.name}</span>
            <span>{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingPillars({
  items,
}: {
  readonly items: readonly { readonly glyph: ReactNode; readonly title: string; readonly text: string }[];
}) {
  return (
    <section className="landing-pillars">
      <div className="landing-pillars-inner">
        {items.map((item) => (
          <div key={item.title} className="pillar">
            <span className="glyph">{item.glyph}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const AUTH_HERO_EYEBROW = "Voice-led DSA interview practice";

export const AUTH_HERO_TITLE = (
  <>
    Stop rehearsing answers. <em>Start surviving interviews.</em>
  </>
);

export const AUTH_HERO_SUB =
  "Reading solutions feels like progress until a real interviewer says \u201Cwalk me through your thinking\u201D and your mind goes blank. Interview Coach fixes that: timed voice interviews on a real curriculum, an interviewer that pushes back, and scoring that tells you exactly what to fix next.";

export const AUTH_PILLARS = [
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
    glyph: "\u21BB",
    title: "Adaptive loop. Every session picks the next one.",
    text: "Master a topic and move on. Struggle and it holds you there until the weakness clears.",
  },
] as const;

export const AUTH_SCORE_ROWS = [
  { name: "problem_understanding", value: "4 / 5" },
  { name: "approach", value: "4 / 5" },
  { name: "coding", value: "4 / 5" },
  { name: "independence", value: "2 / 5" },
] as const;

export const AUTH_SCORE_META = "Move Zeroes \u00B7 Arrays \u00B7 Easy \u00B7 12 min";

export function MarketingAuthModal({
  label,
  onClose,
  children,
}: {
  readonly label: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (ref.current !== null && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="auth-dialog"
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="modal-close" onClick={onClose} autoFocus aria-label="Close">
        ×
      </button>
      {children}
    </dialog>
  );
}

export function MarketingSection({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="landing-section" id={id}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="lede">{lede}</p>
      {children}
    </section>
  );
}

export function MarketingSteps({
  steps,
}: {
  readonly steps: readonly { readonly title: string; readonly text: string }[];
}) {
  return (
    <div className="card landing-steps">
      {steps.map((step, index) => (
        <div key={step.title} className="step">
          <span className="n">{index + 1}</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketingQuote({ children, caption }: { readonly children: ReactNode; readonly caption: string }) {
  return (
    <p className="quote">
      {children}
      <small>{caption}</small>
    </p>
  );
}

export function MarketingFinal({
  title,
  subtitle,
  actions,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly actions: ReactNode;
}) {
  return (
    <section className="landing-final">
      <h2>{title}</h2>
      <p className="sub">{subtitle}</p>
      <div className="cta">{actions}</div>
    </section>
  );
}

export function MarketingFooter({ children }: { readonly children: ReactNode }) {
  return <footer className="landing-footer">{children}</footer>;
}
