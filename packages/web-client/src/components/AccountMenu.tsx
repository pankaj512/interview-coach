// Account control for the app top bar (ux-spec H-Account).
//
// Guest → a "Sign in" button. Signed in → the display name with a dropdown
// (Profile / Settings / Sign out). The token is never rendered.

import { useState } from "react";
import { useAuthSession } from "../state/auth-store.js";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p !== "");
  if (parts.length === 0) return "?";
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?";
}

export function AccountMenu({
  onSignIn,
  onProfile,
  onSettings,
  onSignOut,
}: {
  readonly onSignIn: () => void;
  readonly onProfile: () => void;
  readonly onSettings: () => void;
  readonly onSignOut: () => void;
}) {
  const session = useAuthSession();
  const [open, setOpen] = useState(false);

  if (session === null) {
    return (
      <button type="button" className="btn-ghost" onClick={onSignIn}>
        Sign in
      </button>
    );
  }

  return (
    <div className="account-menu">
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(session.displayName)}
        </span>
        <span className="account-name">{session.displayName}</span>
        <span className="account-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" role="presentation" onClick={() => setOpen(false)} />
          <div className="account-dropdown" role="menu" aria-label="Account">
            <div className="account-id">
              <strong>{session.displayName}</strong>
              <span className="hint">{session.email}</span>
            </div>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onProfile(); }}>
              Profile
            </button>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onSettings(); }}>
              Settings
            </button>
            <button type="button" role="menuitem" className="danger-text" onClick={() => { setOpen(false); onSignOut(); }}>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
