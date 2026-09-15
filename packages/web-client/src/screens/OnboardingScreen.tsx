// H-Onboarding (Phase 2): required first-run profile setup. Shown by the App
// gate for a signed-in user with no profile; no cancel path (it is required
// before the learning loop). Server-state only — the profile is persisted via
// PUT /api/profile.

import { useMemo, useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { ProfileInput, SerializedUserProfile } from "../api/types.js";
import { ProfileForm } from "../components/ProfileForm.js";
import { formatApiError } from "../state/use-interview.js";

export function OnboardingScreen({
  backend,
  onComplete,
}: {
  readonly backend: BackendClient;
  readonly onComplete: (profile: SerializedUserProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = useMemo(
    () => [
      { label: "Welcome", status: "done" },
      { label: "Role & Preferences", status: "active" },
      { label: "Review", status: "todo" },
      { label: "Sign in", status: "todo" },
    ],
    [],
  );

  async function save(input: ProfileInput) {
    setBusy(true);
    setError(null);
    try {
      onComplete(await backend.putProfile(input));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-shell">
      <header className="onboarding-topbar">
        <div className="landing-brand">
          <div className="logo">IC</div>
          <div className="brand-text">
            <span className="name">Interview Coach</span>
            <span className="pill">v1.1</span>
          </div>
        </div>
        <div className="onboarding-progress">
          {steps.map((step, idx) => (
            <div
              key={step.label}
              className={`step ${step.status}${idx < steps.length - 1 ? " with-divider" : ""}`}
            >
              <span className="dot" />
              <span className="label">{step.label}</span>
            </div>
          ))}
        </div>
      </header>

      <main className="onboarding-main">
        <div className="onboarding-hero">
          <div className="hero-pill">
            <span className="dot" />
            <span className="pill-label">Step 2 of 4</span>
            <span>Role, level, goals, and preferences</span>
          </div>
          <h1>Customize your interview curriculum &amp; calibration</h1>
          <p>
            Tell us your target role, level, and modality. We store this securely; in dev mode it is cached locally
            until you sign in.
          </p>
          <div className="hero-meta">
            <span className="check">Pre-auth: cached locally until you save</span>
            <span className="bullet">•</span>
            <span>Dev mode can bypass sign-in for local testing</span>
          </div>
        </div>

        <div className="onboarding-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Profile</p>
              <h2>Role &amp; interview preferences</h2>
              <p className="hint">We use this to recommend the right mocks and rubrics.</p>
            </div>
            {error !== null ? <p className="error-inline">{error}</p> : null}
          </div>
          <ProfileForm submitLabel="Save and continue" busy={busy} error={null} onSubmit={save} />
        </div>
      </main>
    </div>
  );
}
