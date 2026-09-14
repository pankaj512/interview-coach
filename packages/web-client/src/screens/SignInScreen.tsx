// H-Sign-In (Phase 2): email + password, link to create account. Sign-in is
// required — there is no anonymous loop, so no guest path.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import { PrimaryButton } from "../ds/buttons.js";
import { Field } from "../ds/primitives.js";
import { setAuthSession } from "../state/auth-store.js";
import { formatApiError } from "../state/use-interview.js";

export function SignInScreen({
  backend,
  onSuccess,
  onGoCreate,
}: {
  readonly backend: BackendClient;
  readonly onSuccess: () => void;
  readonly onGoCreate: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = await backend.login({ email: email.trim(), password });
      setAuthSession({ token: payload.session.token, email: payload.user.email, displayName: payload.user.displayName });
      onSuccess();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <span className="brand">Interview Coach</span>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Welcome back. Sign in to keep your interviews.</p>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error !== null && <p className="error" role="alert">{error}</p>}
        <PrimaryButton type="submit" disabled={busy || email.trim() === "" || password === ""}>
          {busy ? "Signing in…" : "Sign in"}
        </PrimaryButton>
        <p className="auth-alt">
          Don&apos;t have an account?{" "}
          <button type="button" className="link-button" onClick={onGoCreate}>
            Create one
          </button>
        </p>
      </form>
    </div>
  );
}
