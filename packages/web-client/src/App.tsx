// App shell + interview ritual router (ux-spec §2/§3/§43).
//
// Nav views (Dashboard / History / Progress / Settings) render inside the
// sidebar AppShell. The interview ritual (Setup → Devices → Briefing → Live →
// Evaluating → Results → Feedback/Transcript/Weak areas) renders standalone.

import { useCallback, useEffect, useRef, useState } from "react";
import { BackendApiError, type BackendClient } from "./api/backend-client.js";
import type {
  Problem,
  SerializedCurriculum,
  SerializedInterview,
  SerializedRecommendation,
  SerializedStateSnapshot,
  SerializedUserProfile,
} from "./api/types.js";
import { AppShell, type NavKey } from "./components/AppShell.js";
import { GhostButton } from "./ds/buttons.js";
import { Card } from "./ds/primitives.js";
import type { Difficulty, Interaction, InterviewMode, SessionPlan } from "./flow.js";
import { deleteAllInterviews, deleteHistoryEntry, historyEntriesFromSummaries, type HistoryEntry } from "./history.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { EvaluatingScreen } from "./screens/EvaluatingScreen.js";
import { FeedbackDetailScreen } from "./screens/FeedbackDetailScreen.js";
import { LandingScreen } from "./screens/LandingScreen.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { LiveScreen } from "./screens/LiveScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";
import { OnboardingScreen } from "./screens/OnboardingScreen.js";
import { ProgressScreen } from "./screens/ProgressScreen.js";
import { ResultsScreen } from "./screens/ResultsScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { CreateAccountScreen } from "./screens/CreateAccountScreen.js";
import { ProfileScreen } from "./screens/ProfileScreen.js";
import { SignInScreen } from "./screens/SignInScreen.js";
import { TranscriptReviewScreen } from "./screens/TranscriptReviewScreen.js";
import { WeakAreasScreen } from "./screens/WeakAreasScreen.js";
import { clearAuthSession, useAuthSession } from "./state/auth-store.js";
import {
  currentPath,
  initialSnapshot,
  pathForSnapshot,
  pushPath,
  replacePath,
  resolvePath,
} from "./state/use-client-router.js";
import { useDashboard, type DashboardData } from "./state/use-dashboard.js";
import { formatApiError, useBackendClient, type LiveEvent } from "./state/use-interview.js";

type NavView = NavKey;
type Flow =
  | "lobby"
  | "live"
  | "evaluating"
  | "results"
  | "feedback"
  | "transcript"
  | "weakareas"
  | "signin"
  | "signup"
  | "profile";
type ProfileState = "idle" | "loading" | "ready" | "error";

function asDifficulty(value: string | undefined): Difficulty {
  return value === "Easy" || value === "Hard" ? value : "Medium";
}

// DashboardView mounts the Phase 5 data hook only while the Dashboard is
// visible, so a signed-out or onboarding render never probes user-only APIs.
function DashboardView({
  profile,
  data,
  starting,
  onStart,
  onProfile,
}: {
  readonly profile: SerializedUserProfile;
  readonly data: DashboardData;
  readonly starting: boolean;
  readonly onStart: (
    recommendation: SerializedRecommendation,
    problem: Problem | null,
    curriculum: SerializedCurriculum | null,
  ) => void;
  readonly onProfile: () => void;
}) {
  return (
    <DashboardScreen
      profile={profile}
      data={data}
      starting={starting}
      onStart={onStart}
      onProfile={onProfile}
    />
  );
}

export function App() {
  const backend: BackendClient = useBackendClient();
  const session = useAuthSession();
  const [guestMode, setGuestMode] = useState(false);
  const dashboardData = useDashboard(backend, session !== null && !guestMode);
  const [nav, setNav] = useState<NavView | null>(
    () => initialSnapshot(currentPath(), session !== null).nav,
  );
  const [flow, setFlow] = useState<Flow | null>(
    () => initialSnapshot(currentPath(), session !== null).flow,
  );
  const [profile, setProfile] = useState<SerializedUserProfile | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>(() =>
    session !== null ? "loading" : "idle",
  );
  const [profileNonce, setProfileNonce] = useState(0);
  const [interview, setInterview] = useState<SerializedInterview | null>(null);
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<SerializedStateSnapshot | null>(null);
  const [events, setEvents] = useState<readonly LiveEvent[]>([]);
  const [stale, setStale] = useState(false);
  const [feedbackDimension, setFeedbackDimension] = useState<string | null>(null);
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([]);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const evaluatingTimer = useRef<number | null>(null);

  // Phase 9: history is server-owned. Load the signed-in user's interviews
  // (newest first) whenever the session changes; the browser keeps no local
  // index. Errors surface inline rather than inventing entries. Guest mode
  // skips network calls and shows an empty history.
  const refreshHistory = useCallback(
    async (limit?: number) => {
      if (session === null || guestMode) {
        setEntries([]);
        setHistoryHasMore(false);
        return;
      }
      const effectiveLimit = limit ?? historyLimit;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const list = await backend.listInterviews(effectiveLimit);
        setEntries(historyEntriesFromSummaries(list));
        setHistoryHasMore(list.length >= effectiveLimit);
      } catch (e) {
        setHistoryError(formatApiError(e));
      } finally {
        setHistoryLoading(false);
      }
    },
    [backend, session?.token, historyLimit, guestMode],
  );

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // Phase 2: load the server-owned profile whenever the signed-in session
  // changes. A 401 means the session is stale, so drop it (the gate then shows
  // sign-in); anything else surfaces a retryable error state. Guest mode skips
  // loading and uses a placeholder profile.
  useEffect(() => {
    if (guestMode) {
      setProfile({
        userId: "guest",
        interviewTypes: ["dsa"],
        role: "software_engineer",
        level: "mid",
        goals: "Explore the app",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setProfileState("ready");
      return;
    }
    if (session === null) {
      setProfile(null);
      setProfileState("idle");
      return;
    }
    let cancelled = false;
    setProfileState("loading");
    backend
      .getProfile()
      .then((next) => {
        if (cancelled) return;
        setProfile(next);
        setProfileState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof BackendApiError && error.status === 401) {
          clearAuthSession();
          return;
        }
        setProfileState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token, backend, profileNonce, guestMode]);

  const handleProfileSaved = useCallback((next: SerializedUserProfile) => {
    setProfile(next);
    setProfileState("ready");
    setFlow(null);
    setNav("dashboard");
  }, []);

  function handleAuthSuccess() {
    setFlow(null);
    setNav("dashboard");
  }

  const remember = useCallback(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const loadMoreHistory = useCallback(() => {
    setHistoryLimit((limit) => limit + 20);
  }, []);

  function navigate(key: NavKey) {
    // Profile is a flow, not a nav view; the tab just enters it. Guests
    // and signed-out visitors have no profile, so they get sign-in.
    if (key === "profile") {
      goAuth("profile");
      return;
    }
    setNav(key);
    setFlow(null);
    pushPath(pathForSnapshot(key, null, session !== null || guestMode));
  }

  function goAuth(target: "signin" | "signup" | "profile") {
    const resolved = target === "profile" && session === null ? "signin" : target;
    setNav(null);
    setFlow(resolved);
    if (session === null && !guestMode && (resolved === "signin" || resolved === "signup")) {
      pushPath(`/${resolved}`);
    }
  }

  function closeAuthModal() {
    setFlow(null);
    pushPath("/");
  }

  async function handleSignOut() {
    if (guestMode) {
      setGuestMode(false);
      setProfile(null);
      setProfileState("idle");
      navigate("dashboard");
      return;
    }
    await backend.logout().catch(() => undefined);
    clearAuthSession();
    navigate("dashboard");
  }

  // Phase 5/6: the Dashboard's primary CTA. Accept the recommendation, then
  // create + assign + ready an interview bound to the recommended problem so
  // practice starts from server state (the persisted recommendation linkage is
  // Phase 9; the app-level binding is Phase 6). The Lobby is the final
  // pre-interview step — no manual topic/difficulty/problem selection.
  const startRecommended = useCallback(
    async (
      recommendation: SerializedRecommendation,
      problem: Problem | null,
      curriculum: SerializedCurriculum | null,
    ) => {
    if (session === null) {
      goAuth("signin");
      return;
    }
      setDashboardBusy(true);
      setDashboardError(null);
      try {
        await backend.acceptRecommendation(recommendation.id).catch(() => undefined);
        const difficulty = asDifficulty(problem?.difficulty);
        const durationMinutes = 30;
        const created = await backend.createInterview({
          candidateId: session.displayName || session.email,
          configuration: { interviewType: "dsa", difficulty, durationMinutes, problemCount: 1 },
          // Phase 9: persist the recommendation/topic linkage on the interview.
          recommendationId: recommendation.id,
          topicId: recommendation.topicId,
        });
        const assigned = await backend.assignProblems(created.id, [recommendation.problemId]);
        const ready = await backend.markReady(assigned.id);
        setInterview(ready);
        setSessionPlan({
          interview: ready,
          recommendation,
          problem,
          curriculum,
          mode: "Realistic Interview",
          interaction: "Voice",
          durationMinutes,
          difficulty,
        });
        setFinalSnapshot(null);
        setEvents([]);
        setStale(false);
        setNav(null);
        setFlow("lobby");
        pushPath("/lobby");
      } catch (e) {
        setDashboardError(formatApiError(e));
      } finally {
        setDashboardBusy(false);
      }
    },
    [backend, session],
  );

  const startRecommendedFromDashboard = useCallback(() => {
    if (dashboardData.recommendation === null) return;
    void startRecommended(dashboardData.recommendation, dashboardData.problem, dashboardData.curriculum);
  }, [dashboardData.curriculum, dashboardData.problem, dashboardData.recommendation, startRecommended]);

  const handleFinished = useCallback(
    (snapshot: SerializedStateSnapshot | null, roomEvents: readonly LiveEvent[], _elapsedSec: number) => {
      setFinalSnapshot(snapshot);
      setEvents(roomEvents);
      setStale(false);
      // Phase 9: the interview + its evaluation are persisted server-side, so
      // refresh the server-backed history instead of recording a local entry.
      remember();
      setFlow("evaluating");
      replacePath("/evaluating");
      evaluatingTimer.current = window.setTimeout(() => {
        setFlow("results");
        replacePath("/results");
      }, 1800);
    },
    [remember],
  );

  useEffect(() => () => {
    if (evaluatingTimer.current !== null) window.clearTimeout(evaluatingTimer.current);
  }, []);

  async function openEntry(entry: HistoryEntry) {
    setBusyId(entry.id);
    setHistoryError(null);
    try {
      const snapshot = await backend.getState(entry.id);
      setInterview(snapshot.interview);
      setSessionPlan(null);
      setFinalSnapshot(snapshot);
      setEvents([]);
      setStale(false);
      setNav(null);
      setFlow("results");
      pushPath("/results");
    } catch (e) {
      setHistoryError(`Could not load ${entry.id}: ${formatApiError(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  const deleteEntry = useCallback(
    async (entry: HistoryEntry) => {
      setDeletingId(entry.id);
      setHistoryError(null);
      let failed = false;
      try {
        await deleteHistoryEntry(backend, entry.id, entry.status);
      } catch {
        failed = true;
      }
      await refreshHistory();
      // Curated copy on purpose: the raw backend error names the interview
      // id and a transition code, which is meaningless to candidates.
      if (failed) setHistoryError("Could not delete this interview. Your history was refreshed.");
      setDeletingId(null);
    },
    [backend, refreshHistory],
  );

  // Settings "Delete interviews": hard-delete every interview (paged, since
  // the list is capped), then refresh. The refresh clears a stale error
  // first, so a failure is recorded after it to show the true list state.
  // Copy is curated: raw backend errors name interview ids and codes.
  const [deletingAll, setDeletingAll] = useState(false);
  const deleteAllHistory = useCallback(async () => {
    setDeletingAll(true);
    setHistoryError(null);
    let deleted = 0;
    let failed = false;
    try {
      ({ deleted, failed } = await deleteAllInterviews(backend, historyLimit));
    } catch {
      failed = true;
    }
    await refreshHistory();
    if (failed) {
      setHistoryError(
        deleted > 0
          ? `Could not delete all interviews. ${deleted} deleted; your history was refreshed.`
          : "Could not delete all interviews. Your history was refreshed.",
      );
    }
    setDeletingAll(false);
  }, [backend, historyLimit, refreshHistory]);

  // Settings "Reset learning state": wipe recommendations, skill states, and
  // curriculum progress, then reload the dashboard (which auto-creates a
  // fresh recommendation). Interviews and history are untouched. Copy is
  // curated like delete-all: no ids or codes.
  const [resettingAll, setResettingAll] = useState(false);
  const resetAllLearningState = useCallback(async () => {
    setResettingAll(true);
    setHistoryError(null);
    try {
      await backend.resetLearningState();
    } catch {
      setHistoryError("Could not reset learning state. Your dashboard was refreshed.");
    }
    await dashboardData.reload();
    setResettingAll(false);
  }, [backend, dashboardData]);

  // "New practice" now routes to the Dashboard, whose recommendation CTA is the
  // only entry into a session (roadmap Phase 6: Setup retired).
  function startNew() {
    setInterview(null);
    setSessionPlan(null);
    setFinalSnapshot(null);
    setEvents([]);
    setStale(false);
    navigate("dashboard");
  }

  // ---- Client URL routing (feature 20) ----
  // The URL mirrors nav/flow: user navigations pushed above, automatic
  // transitions replaced, and the normalize effect repairs the URL when a
  // gate overrides what renders (sign-out, auth success, onboarding).
  // These effects sit above every early return so hook order never shifts.
  const signedIn = session !== null || guestMode;
  useEffect(() => {
    const desired = pathForSnapshot(nav, flow, signedIn);
    if (desired !== null && currentPath() !== desired) {
      replacePath(desired);
    }
  }, [nav, flow, signedIn]);

  // Back/forward maps the URL back onto nav/flow through the same fallback
  // table (leaving /signin|/signup closes the modal). Hash-only entries
  // resolve to the current state and are ignored, so in-page anchors keep
  // scrolling natively.
  useEffect(() => {
    const onPopState = () => {
      const resolved = resolvePath(window.location.pathname, {
        signedIn: session !== null || guestMode,
        canLobby: interview !== null && sessionPlan !== null,
        canResults: finalSnapshot !== null,
        canTranscript: finalSnapshot !== null && interview !== null,
      });
      const next =
        "redirect" in resolved
          ? initialSnapshot(resolved.redirect, session !== null || guestMode)
          : resolved;
      if (next.nav !== nav || next.flow !== flow) {
        if ("redirect" in resolved) {
          replacePath(resolved.redirect);
        }
        setNav(next.nav);
        setFlow(next.flow);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [nav, flow, session, guestMode, interview, sessionPlan, finalSnapshot]);

  // ---- First-run gate (Phase 2) ----
  // No anonymous loop: signed-out users only get the landing/sign-in, and a
  // signed-in user with no profile is sent to required onboarding.
  if (session === null && !guestMode) {
    return (
      <LandingScreen
        onSignIn={() => goAuth("signin")}
        onCreateAccount={() => goAuth("signup")}
        onDevGuest={() => {
          setGuestMode(true);
          setFlow(null);
          setNav("dashboard");
        }}
        showDevGuest={import.meta.env.DEV === true || import.meta.env.VITE_DEV_GUEST === "true"}
        authModal={
          flow === "signin" ? (
            <SignInScreen
              backend={backend}
              onSuccess={handleAuthSuccess}
              onGoCreate={() => goAuth("signup")}
            />
          ) : flow === "signup" ? (
            <CreateAccountScreen
              backend={backend}
              onSuccess={handleAuthSuccess}
              onGoSignIn={() => goAuth("signin")}
            />
          ) : null
        }
        authModalLabel={flow === "signup" ? "Create account" : "Sign in"}
        onCloseAuth={closeAuthModal}
      />
    );
  }

  if ((profileState === "loading" || profileState === "idle") && !guestMode) {
    return (
      <main className="app">
        <div className="auth-wrap">
          <p className="hint" role="status">
            Loading your profile…
          </p>
        </div>
      </main>
    );
  }

  if (profileState === "error") {
    return (
      <main className="app">
        <div className="auth-wrap">
          <Card className="auth-card">
            <h1 className="auth-title">Couldn&apos;t load your profile</h1>
            <p className="auth-sub">Check your connection and try again.</p>
            <div className="row actions">
              <GhostButton
                onClick={() => {
                  setProfileState("loading");
                  setProfileNonce((n) => n + 1);
                }}
              >
                Retry
              </GhostButton>
              <GhostButton onClick={handleSignOut}>Sign out</GhostButton>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="app">
        <OnboardingScreen backend={backend} onComplete={handleProfileSaved} />
      </main>
    );
  }

  // ---- Nav views (sidebar shell) ----
  if (nav !== null) {
    return (
      <AppShell
        active={nav}
        onNavigate={navigate}
        onSignIn={() => goAuth("signin")}
        onProfile={() => goAuth("profile")}
        onSignOut={handleSignOut}
      >
        {nav === "dashboard" && (
          <>
            <DashboardView
              profile={profile}
              data={dashboardData}
              starting={dashboardBusy}
              onStart={startRecommended}
              onProfile={() => goAuth("profile")}
            />
            {dashboardError !== null && <p className="error">{dashboardError}</p>}
          </>
        )}
        {nav === "history" && (
          <HistoryScreen
            entries={entries}
            busyId={busyId}
            deletingId={deletingId}
            loading={historyLoading}
            hasMore={historyHasMore}
            onSelect={openEntry}
            onDelete={deleteEntry}
            onLoadMore={loadMoreHistory}
            onNew={startNew}
          />
        )}
        {nav === "progress" && (
          <ProgressScreen
            entries={entries}
            data={dashboardData}
            starting={dashboardBusy}
            onWeakAreas={() => {
              setNav(null);
              setFlow("weakareas");
              pushPath("/weakareas");
            }}
            onStartRecommendation={() => {
              if (session === null) {
                goAuth("signin");
                return;
              }
              startRecommendedFromDashboard();
            }}
          />
        )}
        {nav === "settings" && (
          <SettingsScreen
            entries={entries}
            deletingAll={deletingAll}
            onDeleteAll={() => void deleteAllHistory()}
            resettingAll={resettingAll}
            onResetAll={() => void resetAllLearningState()}
            onSignIn={() => goAuth("signin")}
            onCreateAccount={() => goAuth("signup")}
            onSignOut={handleSignOut}
          />
        )}
        {historyError !== null && <p className="error">{historyError}</p>}
      </AppShell>
    );
  }

  // ---- Profile (full page in the app shell, like Settings) ----
  if (flow === "profile" && session !== null) {
    return (
      <AppShell
        active="profile"
        onNavigate={navigate}
        onSignIn={() => goAuth("signin")}
        onProfile={() => goAuth("profile")}
        onSignOut={handleSignOut}
      >
        <ProfileScreen
          backend={backend}
          identity={{ displayName: session.displayName, email: session.email }}
          profile={profile}
          onSaved={(next) => {
            setProfile(next);
            setProfileState("ready");
          }}
        />
      </AppShell>
    );
  }

  // ---- Interview ritual (standalone) ----
  return (
    <main className="app">
      {flow === "signin" && (
        <div className="auth-wrap">
          <SignInScreen
            backend={backend}
            onSuccess={handleAuthSuccess}
            onGoCreate={() => goAuth("signup")}
            onBack={() => navigate("dashboard")}
          />
        </div>
      )}
      {flow === "signup" && (
        <div className="auth-wrap">
          <CreateAccountScreen
            backend={backend}
            onSuccess={handleAuthSuccess}
            onGoSignIn={() => goAuth("signin")}
            onBack={() => navigate("dashboard")}
          />
        </div>
      )}
      {flow === "lobby" && interview !== null && sessionPlan !== null && (
        <LobbyScreen
          backend={backend}
          plan={sessionPlan}
          onBegin={() => {
            setFlow("live");
            pushPath("/live");
          }}
          onChangeGoal={() => goAuth("profile")}
          onBack={() => navigate("dashboard")}
        />
      )}
      {flow === "live" && interview !== null && sessionPlan !== null && (
        <LiveScreen
          backend={backend}
          interview={interview}
          mode={sessionPlan.mode as InterviewMode}
          interaction={sessionPlan.interaction as Interaction}
          problem={sessionPlan.problem}
          onFinished={handleFinished}
          onExit={() => navigate("dashboard")}
        />
      )}
      {flow === "evaluating" && <EvaluatingScreen />}
      {flow === "results" && (
        <AppShell
          active={null}
          onNavigate={navigate}
          onSignIn={() => goAuth("signin")}
          onProfile={() => goAuth("profile")}
          onSignOut={handleSignOut}
        >
          <div className="standalone">
          <ResultsScreen
            backend={backend}
            snapshot={finalSnapshot}
            stale={stale}
            onHistory={() => navigate("history")}
            onNew={startNew}
            onTranscript={() => {
              setFlow("transcript");
              pushPath("/transcript");
            }}
            onWeakAreas={() => {
              setFlow("weakareas");
              pushPath("/weakareas");
            }}
            onFeedback={(dimensionKey) => {
              setFeedbackDimension(dimensionKey);
              setFlow("feedback");
              pushPath("/feedback");
            }}
          />
          {historyError !== null && <p className="error">{historyError}</p>}
          </div>
        </AppShell>
      )}
      {flow === "feedback" && (
        <div className="shell-content standalone">
          <FeedbackDetailScreen
            evaluation={finalSnapshot?.evaluation ?? null}
            selected={feedbackDimension}
            onSelect={setFeedbackDimension}
            onBack={() => {
              setFeedbackDimension(null);
              setFlow("results");
              pushPath("/results");
            }}
          />
        </div>
      )}
      {flow === "transcript" && interview !== null && (
        <div className="shell-content standalone">
          <TranscriptReviewScreen
            backend={backend}
            interview={interview}
            events={events}
            onWeakAreas={() => {
              setFlow("weakareas");
              pushPath("/weakareas");
            }}
            onBack={() => {
              setFlow("results");
              pushPath("/results");
            }}
          />
        </div>
      )}
      {flow === "weakareas" && (
        <div className="shell-content standalone">
          <WeakAreasScreen
            entries={entries}
            skills={dashboardData.skills}
            curriculum={dashboardData.curriculum}
            onPractice={() => {
              if (session === null) {
                goAuth("signin");
                return;
              }
              startNew();
            }}
            onBack={() => navigate("progress")}
          />
        </div>
      )}
    </main>
  );
}
