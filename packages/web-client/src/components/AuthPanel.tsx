// S8c account panel (HLD 7.1): optional sign-in for the setup screen.
//
// Self-registered local credentials. Signed-out users keep the open local-dev
// flow (candidate id field); signed-in users create owned interviews (the
// backend stamps identity from the session). Social sign-in lands in S8d.

import { useState } from "react";
import type { BackendClient } from "../api/backend-client.js";
import { DangerButton, PrimaryButton } from "../ds/buttons.js";
import { formatApiError } from "../state/use-interview.js";
import { clearAuthSession, setAuthSession, useAuthSession } from "../state/auth-store.js";

export function AuthPanel({ backend }: { readonly backend: BackendClient }) {
  const session = useAuthSession();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session !== null) {
    return (
      <section aria-label="Account">
        <p>
          Signed in as <strong>{session.displayName}</strong> ({session.email}).
          Interviews you create are owned by this account.
        </p>
        <DangerButton
          onClick={() => {
            void backend.logout().catch(() => {
              // Revocation best-effort: the token may already be expired.
            }).finally(() => {
              clearAuthSession();
            });
          }}
        >
          Sign out
        </DangerButton>
      </section>
    );
  }

  async function submit(mode: "register" | "login"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const payload =
        mode === "register"
          ? await backend.register({ email: email.trim(), displayName: displayName.trim(), password })
          : await backend.login({ email: email.trim(), password });
      setAuthSession({
        token: payload.session.token,
        email: payload.user.email,
        displayName: payload.user.displayName,
      });
      setPassword("");
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Account (optional)">
      <p>Optional: sign in so your interviews are owned by your account. Otherwise the local-dev flow stays anonymous.</p>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        Display name (registration only)
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
      </label>
      <label>
        Password (8+ characters)
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      {error !== null && <p role="alert">{error}</p>}
      <PrimaryButton disabled={busy} onClick={() => void submit("register")}>
        {busy ? "Working…" : "Create account"}
      </PrimaryButton>
      <PrimaryButton disabled={busy} onClick={() => void submit("login")}>
        {busy ? "Working…" : "Sign in"}
      </PrimaryButton>
    </section>
  );
}
