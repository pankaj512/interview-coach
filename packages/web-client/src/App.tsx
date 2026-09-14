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
import { loadHistory, recordHistory, type HistoryEntry } from "./history.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { EvaluatingScreen } from "./screens/EvaluatingScreen.js";
import { FeedbackDetailScreen } from "./screens/FeedbackDetailScreen.js";
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
import { useDashboard } from "./state/use-dashboard.js";
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
  backend,
  profile,
  starting,
  onStart,
  onProfile,
}: {
  readonly backend: BackendClient;
  readonly profile: SerializedUserProfile;
  readonly starting: boolean;
  readonly onStart: (
    recommendation: SerializedRecommendation,
    problem: Problem | null,
    curriculum: SerializedCurriculum | null,
  ) => void;
  readonly onProfile: () => void;
}) {
  const data = useDashboard(backend);
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
  const [nav, setNav] = useState<NavView | null>("dashboard");
  const [flow, setFlow] = useState<Flow | null>(null);
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
  const [entries, setEntries] = useState<readonly HistoryEntry[]>(() => loadHistory(localStorage));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const evaluatingTimer = useRef<number | null>(null);

  // Phase 2: load the server-owned profile whenever the signed-in session
  // changes. A 401 means the session is stale, so drop it (the gate then shows
  // sign-in); anything else surfaces a retryable error state.
  useEffect(() => {
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
  }, [session?.token, backend, profileNonce]);

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

  const remember = useCallback((entry: HistoryEntry) => {
    setEntries(recordHistory(localStorage, entry));
  }, []);

  function navigate(key: NavKey) {
    setNav(key);
    setFlow(null);
  }

  function goAuth(target: "signin" | "signup" | "profile") {
    setNav(null);
    setFlow(target);
  }

  async function handleSignOut() {
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
      if (session === null) return;
      setDashboardBusy(true);
      setDashboardError(null);
      try {
        await backend.acceptRecommendation(recommendation.id).catch(() => undefined);
        const difficulty = asDifficulty(problem?.difficulty);
        const durationMinutes = 30;
        const created = await backend.createInterview({
          candidateId: session.displayName || session.email,
          configuration: { interviewType: "dsa", difficulty, durationMinutes, problemCount: 1 },
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
      } catch (e) {
        setDashboardError(formatApiError(e));
      } finally {
        setDashboardBusy(false);
      }
    },
    [backend, session],
  );

  const handleFinished = useCallback(
    (snapshot: SerializedStateSnapshot | null, roomEvents: readonly LiveEvent[], elapsedSec: number) => {
      setFinalSnapshot(snapshot);
      setEvents(roomEvents);
      setStale(false);
      const current = interview;
      if (current !== null) {
        const evaluation = snapshot?.evaluation ?? null;
        const durationMin = Math.max(1, Math.round(elapsedSec / 60));
        const dimensions: Record<string, number> = {};
        if (evaluation !== null) {
          for (const [key, value] of Object.entries(evaluation.dimensions)) {
            dimensions[key] = typeof value === "number" ? value : value.score;
          }
        }
        remember({
          id: current.id,
          candidateId: current.candidateId,
          status: snapshot?.interview.status ?? "completed",
          at: new Date().toISOString(),
          interviewType: current.configuration.interviewType === "dsa" ? "Coding" : current.configuration.interviewType,
          difficulty: current.configuration.difficulty ?? sessionPlan?.difficulty ?? "Medium",
          mode: sessionPlan?.mode ?? "Realistic Interview",
          durationMin,
          ...(evaluation?.overallScore === undefined ? {} : { overallScore: evaluation.overallScore }),
          ...(evaluation?.recommendation === undefined ? {} : { recommendation: evaluation.recommendation }),
          ...(evaluation?.hintsUsed === undefined ? {} : { hintsUsed: evaluation.hintsUsed }),
          ...(evaluation === null ? {} : { strengths: evaluation.strengths, weaknesses: evaluation.weaknesses }),
          ...(Object.keys(dimensions).length === 0 ? {} : { dimensions }),
        });
      }
      setFlow("evaluating");
      evaluatingTimer.current = window.setTimeout(() => setFlow("results"), 1800);
    },
    [interview, remember, sessionPlan],
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
    } catch (e) {
      setHistoryError(`Could not load ${entry.id}: ${formatApiError(e)}`);
    } finally {
      setBusyId(null);
    }
  }

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

  // ---- First-run gate (Phase 2) ----
  // No anonymous loop: signed-out users only get the landing/sign-in, and a
  // signed-in user with no profile is sent to required onboarding.
  if (session === null) {
    return (
      <main className="app">
        {flow === "signup" ? (
          <CreateAccountScreen
            backend={backend}
            onSuccess={handleAuthSuccess}
            onGoSignIn={() => setFlow("signin")}
          />
        ) : (
          <SignInScreen
            backend={backend}
            onSuccess={handleAuthSuccess}
            onGoCreate={() => setFlow("signup")}
          />
        )}
      </main>
    );
  }

  if (profileState === "loading" || profileState === "idle") {
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
              backend={backend}
              profile={profile}
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
            onSelect={openEntry}
            onNew={startNew}
            onBack={() => navigate("dashboard")}
          />
        )}
        {nav === "progress" && (
          <ProgressScreen entries={entries} onWeakAreas={() => { setNav(null); setFlow("weakareas"); }} onNew={startNew} />
        )}
        {nav === "settings" && (
          <SettingsScreen
            entries={entries}
            onHistoryCleared={() => setEntries(loadHistory(localStorage))}
            onSignIn={() => goAuth("signin")}
            onCreateAccount={() => goAuth("signup")}
            onSignOut={handleSignOut}
          />
        )}
        {historyError !== null && <p className="error">{historyError}</p>}
      </AppShell>
    );
  }

  // ---- Interview ritual (standalone) ----
  return (
    <main className="app">
      {flow === "lobby" && interview !== null && sessionPlan !== null && (
        <LobbyScreen
          backend={backend}
          plan={sessionPlan}
          onBegin={() => setFlow("live")}
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
          onFinished={handleFinished}
          onExit={() => navigate("dashboard")}
        />
      )}
      {flow === "evaluating" && <EvaluatingScreen />}
      {flow === "results" && (
        <div className="shell-content standalone">
          <ResultsScreen
            backend={backend}
            snapshot={finalSnapshot}
            events={events}
            stale={stale}
            onHistory={() => navigate("history")}
            onNew={startNew}
            onTranscript={() => setFlow("transcript")}
            onWeakAreas={() => setFlow("weakareas")}
            onFeedback={() => setFlow("feedback")}
          />
          {historyError !== null && <p className="error">{historyError}</p>}
        </div>
      )}
      {flow === "feedback" && (
        <div className="shell-content standalone">
          <FeedbackDetailScreen evaluation={finalSnapshot?.evaluation ?? null} onBack={() => setFlow("results")} />
        </div>
      )}
      {flow === "transcript" && interview !== null && (
        <div className="shell-content standalone">
          <TranscriptReviewScreen interview={interview} events={events} onBack={() => setFlow("results")} />
        </div>
      )}
      {flow === "weakareas" && (
        <div className="shell-content standalone">
          <WeakAreasScreen entries={entries} onPractice={startNew} onBack={() => navigate("progress")} />
        </div>
      )}
      {flow === "profile" && (
        <ProfileScreen
          backend={backend}
          identity={{ displayName: session.displayName, email: session.email }}
          profile={profile}
          onSaved={handleProfileSaved}
          onBack={() => navigate("dashboard")}
          onSettings={() => navigate("settings")}
          onSignOut={handleSignOut}
        />
      )}
    </main>
  );
}
