// Settings > Account section (ux-spec H-Account).
//
// Guest state offers sign in / create account; signed-in state shows the
// account identity and a sign-out action. No combined auth form here.

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
        <div className="account-row">
          <span className="chip-guest">○ Guest</span>
          <span className="hint">You&apos;re browsing as a guest. Interviews stay on this browser only.</span>
        </div>
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
