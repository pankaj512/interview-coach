// Client URL routing without a router dependency.
//
// Owns: the total, side-effect-free mapping between App nav/flow state and
// paths, plus guarded history helpers. Surprising: guards keep StrictMode
// double-invocation from writing duplicate entries.
//
// History: 20; see docs/SESSION_HANDOFF.md.

import type { NavKey } from "../components/AppShell.js";

export type RouterFlow =
  | "lobby"
  | "live"
  | "evaluating"
  | "results"
  | "transcript"
  | "weakareas"
  | "signin"
  | "signup"
  | "profile";

export interface RouteSnapshot {
  readonly nav: NavKey | null;
  readonly flow: RouterFlow | null;
}

export interface ResolveContext {
  readonly signedIn: boolean;
  readonly canLobby: boolean;
  readonly canResults: boolean;
  readonly canTranscript: boolean;
}

export type ResolvedRoute = RouteSnapshot | { readonly redirect: string };

const NAV_PATHS: Record<string, NavKey> = {
  "/dashboard": "dashboard",
  "/history": "history",
  "/progress": "progress",
  "/settings": "settings",
};

const FLOW_PATHS: Record<string, RouterFlow> = {
  "/lobby": "lobby",
  "/live": "live",
  "/evaluating": "evaluating",
  "/results": "results",
  "/transcript": "transcript",
  "/weakareas": "weakareas",
  "/signin": "signin",
  "/signup": "signup",
  "/profile": "profile",
};

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

// Total mapping: every path resolves to a snapshot or a redirect target.
// Ritual flows need their in-memory state; without it they fall back instead
// of rendering an empty shell.
export function resolvePath(pathname: string, ctx: ResolveContext): ResolvedRoute {
  const path = normalizePath(pathname);
  if (path === "/") {
    return ctx.signedIn ? { nav: "dashboard", flow: null } : { nav: null, flow: null };
  }
  const nav = NAV_PATHS[path];
  if (nav !== undefined) {
    return ctx.signedIn ? { nav, flow: null } : { redirect: "/" };
  }
  const flow = FLOW_PATHS[path];
  if (flow === undefined) {
    return { redirect: ctx.signedIn ? "/dashboard" : "/" };
  }
  if (flow === "signin" || flow === "signup") {
    return ctx.signedIn ? { redirect: "/dashboard" } : { nav: null, flow };
  }
  if (!ctx.signedIn) {
    return { redirect: "/" };
  }
  if (flow === "profile" || flow === "evaluating") {
    return { nav: null, flow };
  }
  if (flow === "lobby" || flow === "live") {
    return ctx.canLobby ? { nav: null, flow } : { redirect: "/dashboard" };
  }
  if (flow === "transcript") {
    return ctx.canTranscript ? { nav: null, flow } : { redirect: "/dashboard" };
  }
  return ctx.canResults ? { nav: null, flow } : { redirect: "/dashboard" };
}

// First-render hydration: redirects only ever point at `/` or `/dashboard`,
// which resolve directly, so one follow-up step always lands on a snapshot.
export function initialSnapshot(pathname: string, signedIn: boolean): RouteSnapshot {
  const empty: ResolveContext = {
    signedIn,
    canLobby: false,
    canResults: false,
    canTranscript: false,
  };
  const first = resolvePath(pathname, empty);
  if (!("redirect" in first)) return first;
  const second = resolvePath(first.redirect, empty);
  if (!("redirect" in second)) return second;
  return signedIn ? { nav: "dashboard", flow: null } : { nav: null, flow: null };
}

// Reverse mapping for URL sync. Returns null for states with no public URL
// (signed-in auth screens keep the underlying page URL; the onboarding gate
// renders over whatever authenticated route is showing).
export function pathForSnapshot(
  nav: NavKey | null,
  flow: RouterFlow | null,
  signedIn: boolean,
): string | null {
  if (!signedIn) {
    if (flow === "signin") return "/signin";
    if (flow === "signup") return "/signup";
    return "/";
  }
  if (flow === "signin" || flow === "signup") return null;
  if (flow !== null) return `/${flow}`;
  if (nav !== null) return `/${nav}`;
  return null;
}

export function currentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function writePath(path: string | null, method: "push" | "replace"): void {
  if (typeof window === "undefined" || path === null) return;
  if (window.location.pathname === path) return;
  if (method === "push") {
    window.history.pushState(null, "", path);
  } else {
    window.history.replaceState(null, "", path);
  }
  window.scrollTo(0, 0);
}

// User navigations get a history entry so Back returns; automatic
// transitions and gate normalizations replace so Back skips them.
export function pushPath(path: string | null): void {
  writePath(path, "push");
}

export function replacePath(path: string | null): void {
  writePath(path, "replace");
}
