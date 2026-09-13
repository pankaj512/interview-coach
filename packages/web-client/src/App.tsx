// App shell + interview ritual router (ux-spec §2/§3/§43).
//
// Nav views (Dashboard / History / Progress / Settings) render inside the
// sidebar AppShell. The interview ritual (Setup → Devices → Briefing → Live →
// Evaluating → Results → Feedback/Transcript/Weak areas) renders standalone.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BackendClient } from "./api/backend-client.js";
import type { SerializedInterview, SerializedStateSnapshot } from "./api/types.js";
import { AppShell, type NavKey } from "./components/AppShell.js";
import { loadHistory, recordHistory, type HistoryEntry } from "./history.js";
import { BriefingScreen } from "./screens/BriefingScreen.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { EvaluatingScreen } from "./screens/EvaluatingScreen.js";
import { FeedbackDetailScreen } from "./screens/FeedbackDetailScreen.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { LiveScreen } from "./screens/LiveScreen.js";
import { ProgressScreen } from "./screens/ProgressScreen.js";
import { ResultsScreen } from "./screens/ResultsScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { CreateAccountScreen } from "./screens/CreateAccountScreen.js";
import { ProfileScreen } from "./screens/ProfileScreen.js";
import { SetupScreen, type Interaction, type InterviewMode, type SetupResult } from "./screens/SetupScreen.js";
import { SignInScreen } from "./screens/SignInScreen.js";
import { TranscriptReviewScreen } from "./screens/TranscriptReviewScreen.js";
import { WeakAreasScreen } from "./screens/WeakAreasScreen.js";
import { clearAuthSession } from "./state/auth-store.js";
import { formatApiError, useBackendClient, type LiveEvent } from "./state/use-interview.js";

type NavView = Exclude<NavKey, "setup">;
type Flow =
  | "setup"
  | "briefing"
  | "live"
  | "evaluating"
  | "results"
  | "feedback"
  | "transcript"
  | "weakareas"
  | "signin"
  | "signup"
  | "profile";

export function App() {
  const backend: BackendClient = useBackendClient();
  const [nav, setNav] = useState<NavView | null>("dashboard");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [interview, setInterview] = useState<SerializedInterview | null>(null);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<SerializedStateSnapshot | null>(null);
  const [events, setEvents] = useState<readonly LiveEvent[]>([]);
  const [stale, setStale] = useState(false);
  const [entries, setEntries] = useState<readonly HistoryEntry[]>(() => loadHistory(localStorage));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const evaluatingTimer = useRef<number | null>(null);

  const remember = useCallback((entry: HistoryEntry) => {
    setEntries(recordHistory(localStorage, entry));
  }, []);

  function navigate(key: NavKey) {
    if (key === "setup") {
      setNav(null);
      setFlow("setup");
      return;
    }
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

  function handleCreated(result: SetupResult) {
    setInterview(result.interview);
    setSetupResult(result);
    setFinalSnapshot(null);
    setEvents([]);
    setStale(false);
    setNav(null);
    // Straight to the briefing/lobby, which requests the microphone.
    setFlow("briefing");
  }

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
          difficulty: current.configuration.difficulty ?? setupResult?.difficulty ?? "Medium",
          mode: setupResult?.mode ?? "Realistic Interview",
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
    [interview, remember, setupResult],
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
      setSetupResult(null);
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

  function startNew() {
    setInterview(null);
    setSetupResult(null);
    setFinalSnapshot(null);
    setEvents([]);
    setStale(false);
    setNav(null);
    setFlow("setup");
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
          <DashboardScreen entries={entries} onStart={startNew} onHistory={() => navigate("history")} onOpen={openEntry} />
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
      {flow === "setup" && <SetupScreen onCreated={handleCreated} onCancel={() => navigate("dashboard")} />}
      {flow === "briefing" && interview !== null && setupResult !== null && (
        <BriefingScreen
          interview={interview}
          mode={setupResult.mode}
          interaction={setupResult.interaction}
          onBegin={() => setFlow("live")}
          onBack={() => setFlow("setup")}
        />
      )}
      {flow === "live" && interview !== null && setupResult !== null && (
        <LiveScreen
          backend={backend}
          interview={interview}
          mode={setupResult.mode as InterviewMode}
          interaction={setupResult.interaction as Interaction}
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
      {flow === "signin" && (
        <SignInScreen
          backend={backend}
          onSuccess={() => navigate("dashboard")}
          onGoCreate={() => setFlow("signup")}
          onGuest={() => navigate("dashboard")}
        />
      )}
      {flow === "signup" && (
        <CreateAccountScreen
          backend={backend}
          onSuccess={() => navigate("dashboard")}
          onGoSignIn={() => setFlow("signin")}
          onGuest={() => navigate("dashboard")}
        />
      )}
      {flow === "profile" && (
        <ProfileScreen
          onBack={() => navigate("dashboard")}
          onSettings={() => navigate("settings")}
          onSignOut={handleSignOut}
        />
      )}
    </main>
  );
}
