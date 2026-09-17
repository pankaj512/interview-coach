// Marketing primitives (feature 17a): public landing sections on the
// approved prototype look. Copy lives in LandingScreen; these components
// own structure only.

import type { ReactNode } from "react";

export interface MarketingNavLink {
  readonly href: string;
  readonly label: string;
}

export function MarketingTopbar({
  navLinks,
  actions,
}: {
  readonly navLinks: readonly MarketingNavLink[];
  readonly actions: ReactNode;
}) {
  return (
    <header className="landing-topbar">
      <div className="landing-topbar-inner">
        <span className="brand">Interview Coach</span>
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
