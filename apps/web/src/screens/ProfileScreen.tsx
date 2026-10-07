// H-Profile (Phase 2): account identity + server-owned profile with inline
// editing. Identity is passed in (App owns the auth session) so this screen
// stays presentational and testable; the profile itself is fetched and saved
// through the backend. The form remounts after each save so its dirty
// tracking restarts from the freshly saved profile.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { ProfileInput, SerializedUserProfile } from "../api/types.js";
import { ProfileForm } from "../components/ProfileForm.js";
import { FormCard } from "../ds/primitives.js";
import { formatApiError } from "../state/use-interview.js";

export function ProfileScreen({
  backend,
  identity,
  profile,
  onSaved,
}: {
  readonly backend: BackendClient;
  readonly identity: { readonly displayName: string; readonly email: string };
  readonly profile: SerializedUserProfile | null;
  readonly onSaved: (profile: SerializedUserProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(input: ProfileInput) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await backend.putProfile(input));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="visually-hidden">Profile</h1>
      <FormCard title="Account">
        <div className="profile-identity">
          <span className="avatar avatar-lg" aria-hidden="true">
            {identity.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{identity.displayName}</strong>
            <br />
            <span className="hint">{identity.email}</span>
          </span>
        </div>
      </FormCard>
      <ProfileForm
        key={profile?.updatedAt ?? "new"}
        initial={profile}
        className="card onboarding-card"
        submitLabel="Save changes"
        busy={busy}
        error={error}
        onSubmit={save}
        hideSubmitUntilDirty
      />
    </>
  );
}
