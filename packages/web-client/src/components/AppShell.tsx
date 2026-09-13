// App shell (ux-spec §2/§3): top bar + left sidebar navigation.
//
// The interview room uses its own minimal chrome; every other screen renders
// inside this shell so navigation stays consistent. The top-right account
// control is guest ("Sign in") or the signed-in name + dropdown.

import type { ReactNode } from "react";
import { AccountMenu } from "./AccountMenu.js";

export type NavKey = "dashboard" | "setup" | "history" | "progress" | "settings";

const NAV: readonly { key: NavKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "history", label: "Interview History" },
  { key: "progress", label: "Progress" },
  { key: "settings", label: "Settings" },
];

export function AppShell({
  active,
  onNavigate,
  onSignIn,
  onProfile,
  onSignOut,
  children,
}: {
  readonly active: NavKey | null;
  readonly onNavigate: (key: NavKey) => void;
  readonly onSignIn: () => void;
  readonly onProfile: () => void;
  readonly onSignOut: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="shell">
      <header className="shell-topbar">
        <span className="brand">Interview Coach</span>
        <span className="spacer" />
        <AccountMenu
          onSignIn={onSignIn}
          onProfile={onProfile}
          onSettings={() => onNavigate("settings")}
          onSignOut={onSignOut}
        />
      </header>
      <div className="shell-body">
        <nav className="shell-sidebar" aria-label="Primary">
          <ul>
            {NAV.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={item.key === active ? "nav-item nav-active" : "nav-item"}
                  aria-current={item.key === active ? "page" : undefined}
                  onClick={() => onNavigate(item.key)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="shell-foot">
            <span className="hint">Practice like it&apos;s the real thing.</span>
          </div>
        </nav>
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
