// Feature 20 route table: the url<->state mapping is total and the
// fallbacks match the spec contract.

import { describe, expect, it } from "vitest";
import {
  initialSnapshot,
  pathForSnapshot,
  resolvePath,
  type ResolveContext,
} from "../src/state/use-client-router.js";

const signedOut: ResolveContext = {
  signedIn: false,
  canLobby: false,
  canResults: false,
  canTranscript: false,
};

const signedInBare: ResolveContext = {
  signedIn: true,
  canLobby: false,
  canResults: false,
  canTranscript: false,
};

const signedInReady: ResolveContext = {
  signedIn: true,
  canLobby: true,
  canResults: true,
  canTranscript: true,
};

describe("resolvePath", () => {
  it("maps / to landing when signed out and dashboard when signed in", () => {
    expect(resolvePath("/", signedOut)).toEqual({ nav: null, flow: null });
    expect(resolvePath("/", signedInBare)).toEqual({ nav: "dashboard", flow: null });
  });

  it("opens the auth modal for signed-out /signin and /signup", () => {
    expect(resolvePath("/signin", signedOut)).toEqual({ nav: null, flow: "signin" });
    expect(resolvePath("/signup", signedOut)).toEqual({ nav: null, flow: "signup" });
  });

  it("redirects signed-in /signin to the dashboard", () => {
    expect(resolvePath("/signin", signedInBare)).toEqual({ redirect: "/dashboard" });
    expect(resolvePath("/signup", signedInReady)).toEqual({ redirect: "/dashboard" });
  });

  it("renders nav views when signed in and bounces signed-out deep links to /", () => {
    expect(resolvePath("/history", signedInBare)).toEqual({ nav: "history", flow: null });
    expect(resolvePath("/progress", signedInBare)).toEqual({ nav: "progress", flow: null });
    expect(resolvePath("/settings", signedInBare)).toEqual({ nav: "settings", flow: null });
    expect(resolvePath("/dashboard", signedOut)).toEqual({ redirect: "/" });
    expect(resolvePath("/history", signedOut)).toEqual({ redirect: "/" });
  });

  it("renders the profile flow when signed in", () => {
    expect(resolvePath("/profile", signedInBare)).toEqual({ nav: null, flow: "profile" });
    expect(resolvePath("/profile", signedOut)).toEqual({ redirect: "/" });
  });

  it("requires in-memory state for lobby/live and falls back to the dashboard", () => {
    expect(resolvePath("/lobby", signedInReady)).toEqual({ nav: null, flow: "lobby" });
    expect(resolvePath("/live", signedInReady)).toEqual({ nav: null, flow: "live" });
    expect(resolvePath("/lobby", signedInBare)).toEqual({ redirect: "/dashboard" });
    expect(resolvePath("/live", signedOut)).toEqual({ redirect: "/" });
  });

  it("requires a snapshot for results and an interview for the transcript", () => {
    expect(resolvePath("/results", signedInReady)).toEqual({ nav: null, flow: "results" });
    expect(resolvePath("/feedback", signedInReady)).toEqual({ redirect: "/dashboard" });
    expect(resolvePath("/weakareas", signedInReady)).toEqual({ nav: null, flow: "weakareas" });
    expect(resolvePath("/results", signedInBare)).toEqual({ redirect: "/dashboard" });
    expect(resolvePath("/transcript", signedInReady)).toEqual({ nav: null, flow: "transcript" });
    expect(
      resolvePath("/transcript", { ...signedInReady, canTranscript: false }),
    ).toEqual({ redirect: "/dashboard" });
  });

  it("sends unknown paths to the signed-out/in landing", () => {
    expect(resolvePath("/nope", signedOut)).toEqual({ redirect: "/" });
    expect(resolvePath("/nope", signedInBare)).toEqual({ redirect: "/dashboard" });
  });

  it("tolerates trailing slashes", () => {
    expect(resolvePath("/history/", signedInBare)).toEqual({ nav: "history", flow: null });
  });
});

describe("initialSnapshot", () => {
  it("follows one redirect so first render never lands on a redirect", () => {
    expect(initialSnapshot("/live", false)).toEqual({ nav: null, flow: null });
    expect(initialSnapshot("/live", true)).toEqual({ nav: "dashboard", flow: null });
    expect(initialSnapshot("/history", false)).toEqual({ nav: null, flow: null });
    expect(initialSnapshot("/nope", true)).toEqual({ nav: "dashboard", flow: null });
    expect(initialSnapshot("/signup", false)).toEqual({ nav: null, flow: "signup" });
  });
});

describe("pathForSnapshot", () => {
  it("maps signed-out modal flows to auth paths and everything else to /", () => {
    expect(pathForSnapshot(null, "signin", false)).toBe("/signin");
    expect(pathForSnapshot(null, "signup", false)).toBe("/signup");
    expect(pathForSnapshot("dashboard", null, false)).toBe("/");
    expect(pathForSnapshot(null, null, false)).toBe("/");
  });

  it("maps signed-in nav and ritual flows to their paths", () => {
    expect(pathForSnapshot("history", null, true)).toBe("/history");
    expect(pathForSnapshot(null, "lobby", true)).toBe("/lobby");
    expect(pathForSnapshot(null, "profile", true)).toBe("/profile");
    expect(pathForSnapshot("dashboard", null, true)).toBe("/dashboard");
  });

  it("leaves the URL alone for states with no public path", () => {
    expect(pathForSnapshot(null, "signin", true)).toBeNull();
    expect(pathForSnapshot(null, "signup", true)).toBeNull();
    expect(pathForSnapshot(null, null, true)).toBeNull();
  });
});
