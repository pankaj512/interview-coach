// H-Profile (Phase 2): account identity + server-owned profile summary, with
// an inline editor. Identity is passed in (App owns the auth session) so this
// screen stays presentational and testable; the profile itself is fetched and
// saved through the backend.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import type { ProfileInput, SerializedUserProfile } from "../api/types.js";
import { ProfileForm } from "../components/ProfileForm.js";
import { DangerButton, GhostButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import { interviewTypeLabel, levelLabel, roleLabel } from "../profile-taxonomy.js";
import { formatApiError } from "../state/use-interview.js";

export function ProfileScreen({
  backend,
  identity,
  profile,
  onSaved,
  onBack,
  onSettings,
  onSignOut,
}: {
  readonly backend: BackendClient;
  readonly identity: { readonly displayName: string; readonly email: string };
  readonly profile: SerializedUserProfile | null;
  readonly onSaved: (profile: SerializedUserProfile) => void;
  readonly onBack: () => void;
  readonly onSettings: () => void;
  readonly onSignOut: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(input: ProfileInput) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await backend.putProfile(input));
      setEditing(false);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="auth-wrap">
        <div className="onboarding">
          <header className="onboarding-head">
            <h1 className="auth-title">Edit profile</h1>
            <p className="auth-sub">Changes apply to future recommendations.</p>
          </header>
          <ProfileForm
            initial={profile}
            submitLabel="Save changes"
            busy={busy}
            error={error}
            onSubmit={save}
            onCancel={() => {
              setEditing(false);
              setError(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <Card className="auth-card profile-card">
        <span className="avatar avatar-lg" aria-hidden="true">
          {identity.displayName.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="auth-title">{identity.displayName}</h1>
        <p className="auth-sub">{identity.email}</p>
        {profile === null ? (
          <p className="hint">Your profile is not set up yet.</p>
        ) : (
          <dl className="profile-facts">
            <div>
              <dt>Preparing for</dt>
              <dd>{profile.interviewTypes.map(interviewTypeLabel).join(", ")}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{roleLabel(profile.role)}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{levelLabel(profile.level)}</dd>
            </div>
            {profile.goals !== undefined && (
              <div>
                <dt>Goals</dt>
                <dd>{profile.goals}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="row actions">
          <GhostButton onClick={() => setEditing(true)}>Edit profile</GhostButton>
          <GhostButton onClick={onSettings}>Settings</GhostButton>
          <DangerButton onClick={onSignOut}>Sign out</DangerButton>
        </div>
        <button type="button" className="link-button" onClick={onBack}>
          Back to dashboard
        </button>
      </Card>
    </div>
  );
}
