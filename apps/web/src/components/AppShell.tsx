// App shell (feature 17a): top-bar navigation on the approved prototype
// look. The interview room uses its own minimal chrome; every other screen
// renders inside this shell. Props contract unchanged: active section,
// navigation/account callbacks, content child.

import type { ReactNode } from "react";
import { AccountMenu } from "./AccountMenu.js";

export type NavKey = "dashboard" | "history" | "progress" | "profile" | "settings";

const NAV: readonly { key: NavKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "history", label: "Interview History" },
  { key: "progress", label: "Progress" },
  { key: "profile", label: "Profile" },
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
        <div className="shell-topbar-inner">
          <button type="button" className="brand" onClick={() => onNavigate("dashboard")}>
            Interview Coach
          </button>
          <nav className="shell-nav" aria-label="Primary">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={item.key === active ? "shell-nav-link shell-nav-active" : "shell-nav-link"}
                aria-current={item.key === active ? "page" : undefined}
                onClick={() => onNavigate(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <span className="who">
            <AccountMenu
              onSignIn={onSignIn}
              onProfile={onProfile}
              onSettings={() => onNavigate("settings")}
              onSignOut={onSignOut}
            />
          </span>
        </div>
      </header>
      <main className="shell-content">{children}</main>
    </div>
  );
}
