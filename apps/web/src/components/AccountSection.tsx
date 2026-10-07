// Settings > Account card (ux-spec §30): signed-in identity with profile
// management, or the signed-in entry point (the App gate normally prevents
// reaching Settings signed out, so this is a fallback, not a loop).

import { Card } from "../ds/primitives.js";
import { DangerButton, PrimaryButton } from "../ds/buttons.js";
import { useAuthSession } from "../state/auth-store.js";

export function AccountSection({
  onSignIn,
  onCreateAccount,
  onSignOut,
}: {
  readonly onSignIn: () => void;
  readonly onCreateAccount: () => void;
  readonly onSignOut: () => void;
}) {
  const session = useAuthSession();

  if (session === null) {
    return (
      <Card className="settings-section">
        <h2 className="section-title">Account</h2>
        <p className="hint">Sign in to save your interviews and track progress.</p>
        <div className="row actions">
          <PrimaryButton onClick={onSignIn}>Sign in</PrimaryButton>
          <button type="button" className="link-button" onClick={onCreateAccount}>
            Create an account
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="settings-section">
      <h2 className="section-title">Account</h2>
      <div className="kv">
        <span>Display name</span>
        <strong>{session.displayName}</strong>
      </div>
      <div className="kv">
        <span>Email</span>
        <strong>{session.email}</strong>
      </div>
      <div className="row actions">
        <DangerButton onClick={onSignOut}>Sign out</DangerButton>
      </div>
    </Card>
  );
}
