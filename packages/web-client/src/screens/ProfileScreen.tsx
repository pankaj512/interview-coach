// H-Profile: account details, link to settings, sign out.

import { GhostButton, DangerButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import { useAuthSession } from "../state/auth-store.js";

export function ProfileScreen({
  onBack,
  onSettings,
  onSignOut,
}: {
  readonly onBack: () => void;
  readonly onSettings: () => void;
  readonly onSignOut: () => void;
}) {
  const session = useAuthSession();
  if (session === null) {
    return (
      <div className="auth-wrap">
        <Card className="auth-card">
          <h1 className="auth-title">Profile</h1>
          <p className="hint">You&apos;re browsing as a guest.</p>
          <GhostButton onClick={onBack}>Back</GhostButton>
        </Card>
      </div>
    );
  }
  return (
    <div className="auth-wrap">
      <Card className="auth-card profile-card">
        <span className="avatar avatar-lg" aria-hidden="true">
          {session.displayName.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="auth-title">{session.displayName}</h1>
        <p className="auth-sub">{session.email}</p>
        <div className="row actions">
          <GhostButton onClick={onSettings}>Settings</GhostButton>
          <DangerButton onClick={onSignOut}>Sign out</DangerButton>
        </div>
        <button type="button" className="link-button auth-guest" onClick={onBack}>
          Back to dashboard
        </button>
      </Card>
    </div>
  );
}
