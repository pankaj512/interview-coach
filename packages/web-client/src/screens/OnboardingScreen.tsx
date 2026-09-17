// H-Onboarding (feature 17a): required first-run profile setup on the
// approved prototype look. Shown by the App gate for a signed-in user
// with no profile; no cancel path. Server-state only — the profile is
// persisted via PUT /api/profile.

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
        <div className="onboarding-topbar-inner">
          <span className="brand">Interview Coach</span>
          <span className="steps">
            {steps.map((step) => (
              <span key={step.label} className={step.status === "active" ? "on" : undefined}>
                {step.label}
              </span>
            ))}
          </span>
        </div>
      </header>

      <main className="onboarding-main">
        <p className="eyebrow">Step 2 of 4</p>
        <h1>Role &amp; interview preferences</h1>
        <p className="sub">
          We use this to recommend the right mocks and rubrics. Pre-auth entries are cached locally
          until you sign in.
        </p>
        <div className="onboarding-card">
          {error !== null && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
          <ProfileForm submitLabel="Save and continue" busy={busy} error={null} onSubmit={save} />
        </div>
        <p className="fine">Dev mode can bypass sign-in for local testing.</p>
      </main>
    </div>
  );
}
