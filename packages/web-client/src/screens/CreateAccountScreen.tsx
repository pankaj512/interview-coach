// H-Create-Account (Phase 2): display name + email + password, link to sign in.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import { PrimaryButton } from "../ds/buttons.js";
import { Field } from "../ds/primitives.js";
import { setAuthSession } from "../state/auth-store.js";
import { formatApiError } from "../state/use-interview.js";

export function CreateAccountScreen({
  backend,
  onSuccess,
  onGoSignIn,
  onBack,
}: {
  readonly backend: BackendClient;
  readonly onSuccess: () => void;
  readonly onGoSignIn: () => void;
  readonly onBack?: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = await backend.register({ email: email.trim(), displayName: displayName.trim(), password });
      setAuthSession({ token: payload.session.token, email: payload.user.email, displayName: payload.user.displayName });
      onSuccess();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  const invalid = displayName.trim() === "" || email.trim() === "" || password.length < 8;

  return (
    <form className="card auth-card" onSubmit={submit}>
      {onBack !== undefined && (
        <button type="button" className="link-button" onClick={onBack}>
          Back
        </button>
      )}
        <span className="brand">Interview Coach</span>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-sub">Save your interviews and track progress over time.</p>
        <Field label="Display name">
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password (8+ characters)" hint="At least 8 characters.">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {error !== null && <p className="error" role="alert">{error}</p>}
        <PrimaryButton type="submit" disabled={busy || invalid}>
          {busy ? "Creating..." : "Create account"}
        </PrimaryButton>
        <p className="auth-alt">
          Already have an account?{" "}
          <button type="button" className="link-button" onClick={onGoSignIn}>
            Sign in
          </button>
        </p>
      </form>
  );
}
