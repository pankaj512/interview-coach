// H-Onboarding (Phase 2): required first-run profile setup. Shown by the App
// gate for a signed-in user with no profile; no cancel path (it is required
// before the learning loop). Server-state only — the profile is persisted via
// PUT /api/profile.

import { useState } from "react";
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
    <div className="auth-wrap">
      <div className="onboarding">
        <header className="onboarding-head">
          <span className="brand">Interview Coach</span>
          <h1 className="auth-title">Set up your profile</h1>
          <p className="auth-sub">
            Tell us what you&apos;re preparing for so we can recommend the right
            practice.
          </p>
        </header>
        <ProfileForm
          submitLabel="Save and continue"
          busy={busy}
          error={error}
          onSubmit={save}
        />
      </div>
    </div>
  );
}
