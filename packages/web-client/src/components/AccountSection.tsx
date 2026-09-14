// Settings > Account section (ux-spec H-Account).
//
// Phase 2: there is no anonymous loop, so the signed-out state just points at
// sign-in (the App gate normally prevents reaching Settings signed out).

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
        <h3 className="section-title">Account</h3>
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
      <h3 className="section-title">Account</h3>
      <div className="account-row">
        <span className="chip-signed">● Signed in</span>
        <div className="account-id-inline">
          <strong>{session.displayName}</strong>
          <span className="hint">{session.email}</span>
        </div>
      </div>
      <div className="row actions">
        <DangerButton onClick={onSignOut}>Sign out</DangerButton>
      </div>
    </Card>
  );
}
