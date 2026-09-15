import { ReactNode } from "react";

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
      <div className="landing-brand">
        <div className="logo">IC</div>
        <div className="brand-text">
          <span className="name">Interview Coach</span>
          <span className="pill">v1.1</span>
        </div>
      </div>
      <nav className="landing-nav">
        {navLinks.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      {actions}
    </header>
  );
}

export function MarketingHero({
  pill,
  title,
  subtitle,
  actions,
  meta,
  preview,
}: {
  readonly pill: ReactNode;
  readonly title: ReactNode;
  readonly subtitle: ReactNode;
  readonly actions: ReactNode;
  readonly meta?: ReactNode;
  readonly preview?: ReactNode;
}) {
  return (
    <section className="landing-hero" id="start">
      <div className="hero-content">
        {pill}
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="hero-actions">{actions}</div>
        {meta}
      </div>
      {preview}
    </section>
  );
}

export function MarketingFeatureGrid({ children }: { readonly children: ReactNode }) {
  return (
    <section className="landing-features" id="features">
      {children}
    </section>
  );
}

export function MarketingFeatureCard({ title, children }: { readonly title: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="feature-card">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function MarketingMetrics({ children }: { readonly children: ReactNode }) {
  return (
    <section className="landing-testimonials" id="methodology">
      {children}
    </section>
  );
}

export function MarketingPricing({ children }: { readonly children: ReactNode }) {
  return (
    <section className="landing-pricing" id="pricing">
      {children}
    </section>
  );
}

export function MarketingFooter({ links, actions }: { readonly links: readonly MarketingNavLink[]; readonly actions: ReactNode }) {
  return (
    <footer className="landing-footer" id="docs">
      <div className="footer-brand">
        <div className="logo">IC</div>
        <div>
          <div className="name">Interview Coach</div>
          <div className="muted">Practice like it’s the real thing.</div>
        </div>
      </div>
      <div className="footer-links">
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </div>
      <div className="footer-actions">{actions}</div>
    </footer>
  );
}
