import { useMemo } from "react";
import {
  MarketingFeatureCard,
  MarketingFeatureGrid,
  MarketingFooter,
  MarketingHero,
  MarketingMetrics,
  MarketingPricing,
  MarketingTopbar,
  type MarketingNavLink,
} from "../components/Marketing.js";

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
  const navActions = useMemo(
    () => (
      <div className="landing-nav-actions">
        <button className="ghost" onClick={onSignIn}>
          Sign in
        </button>
        <button className="primary" onClick={onCreateAccount}>
          Start practice
        </button>
      </div>
    ),
    [onSignIn, onCreateAccount],
  );

  const navLinks: MarketingNavLink[] = useMemo(
    () => [
      { href: "#features", label: "Features" },
      { href: "#methodology", label: "Methodology" },
      { href: "#pricing", label: "Pricing" },
      { href: "#docs", label: "Docs" },
    ],
    [],
  );

  return (
    <div className="landing-shell">
      <MarketingTopbar navLinks={navLinks} actions={navActions} />

      <main className="landing-main">
        <MarketingHero
          pill={
            <div className="hero-pill">
              <span className="dot" />
              <span className="pill-label">v1.1 Release</span>
              <span>Real-time latency under 120ms with multimodal voice/text</span>
            </div>
          }
          title={
            <>
              Master high-stakes technical interviews with <span className="accent">real-time AI guidance</span>.
            </>
          }
          subtitle={
            <>Simulate rigorous system design and coding loops with low-latency voice, live code sandboxing, and instant rubric-based evaluation calibrated to senior engineering tiers.</>
          }
          actions={
            <>
              <button className="primary" onClick={onSignIn}>
                Start practice
              </button>
              <button className="ghost" onClick={onCreateAccount}>
                View features
              </button>
              {showDevGuest && (
                <button className="ghost" onClick={onDevGuest}>
                  Continue without signing in (dev)
                </button>
              )}
            </>
          }
          meta={
            <div className="hero-meta">
              <span className="check">No credit card required</span>
              <span className="bullet">•</span>
              <span>3 free full mock sessions</span>
            </div>
          }
          preview={
            <div className="hero-preview">
              <div className="preview-header">
                <span className="traffic" />
                <span className="title">session_active // arch_loop_round_02.session</span>
                <div className="preview-status">
                  <span className="status-green">WEBRTC 112ms RTT</span>
                  <span className="muted">ThreadSanitizer: ACTIVE</span>
                </div>
              </div>
              <div className="preview-body">
                <div className="preview-pane">
                  <div className="label">Voice stream</div>
                  <div className="bubble interviewer">Interviewer: Design a distributed rate limiter for multi-tenant API traffic.</div>
                  <div className="bubble candidate">You: I’ll start with requirements: per-tenant quotas, burst handling, and global fairness.</div>
                </div>
                <div className="preview-pane code">
                  <div className="label">Scratchpad</div>
                  <pre>
{`// validate bucket
function allowRequest(tenant, key) {
  const bucket = hash(tenant, key);
  const now = clock();
  refill(bucket, now);
  return bucket.tokens > 0;
}`}
                  </pre>
                </div>
              </div>
            </div>
          }
        />

        <MarketingFeatureGrid>
          <MarketingFeatureCard title="Realistic interviewer personas">
            System design, backend, and coding tracks calibrated to Staff/Principal rubrics.
          </MarketingFeatureCard>
          <MarketingFeatureCard title="Voice + text multimodal">
            Low-latency WebRTC voice with transcript and text fallback.
          </MarketingFeatureCard>
          <MarketingFeatureCard title="Progressive coaching hints">
            Request hints without giving away the solution; stays rubric-aligned.
          </MarketingFeatureCard>
          <MarketingFeatureCard title="Evaluation & insights">
            Structured scoring across clarity, depth, trade-offs, and code quality.
          </MarketingFeatureCard>
          <MarketingFeatureCard title="Weakness detection">
            Actionable focus areas and targeted practice loops.
          </MarketingFeatureCard>
          <MarketingFeatureCard title="Code sandbox">
            14-language sandbox for runs during the interview.
          </MarketingFeatureCard>
        </MarketingFeatureGrid>

        <MarketingMetrics>
          <div className="metrics">
            <div>
              <p className="metric">94%</p>
              <p className="metric-label">Offer rate after 5 mocks</p>
            </div>
            <div>
              <p className="metric">140k+</p>
              <p className="metric-label">Mock loops completed</p>
            </div>
            <div>
              <p className="metric">4.9 / 5</p>
              <p className="metric-label">Candidate rating</p>
            </div>
          </div>
          <div className="value-props">
            <h3>Why it works</h3>
            <ul>
              <li>Structured rubric, not generic chat.</li>
              <li>Deterministic fallback when LLM is unavailable.</li>
              <li>Server-owned transcripts, evaluations, and mastery state.</li>
            </ul>
          </div>
        </MarketingMetrics>

        <MarketingPricing>
          <div className="pricing-card">
            <h4>Starter</h4>
            <p className="price">$0</p>
            <p>3 full mock sessions, all interview types, voice + text.</p>
          </div>
          <div className="pricing-card popular">
            <h4>Pro Practice</h4>
            <p className="price">$39/mo</p>
            <p>Unlimited mocks, evaluations, and targeted practice loops.</p>
          </div>
          <div className="pricing-card">
            <h4>Team</h4>
            <p className="price">Custom</p>
            <p>Seat-based pricing, shared rubrics, and aggregated insights.</p>
          </div>
        </MarketingPricing>
      </main>

      <MarketingFooter
        links={navLinks}
        actions={navActions}
      />
    </div>
  );
}
