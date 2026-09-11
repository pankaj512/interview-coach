// S6 app shell — interview ritual flow (ux-spec §5).
//
// Setup → Devices (mic gate) → Lobby → Live → Results, plus History.
// Happy path mirrors the Penpot flow: H-Setup → H-Devices → H-Lobby →
// H-Live → H-Results; recovery branches return to the room or Results —
// no dead ends. Interview state transitions happen against the backend;
// this shell only tracks which screen is visible.

import { useCallback, useState } from "react";
import type { BackendClient } from "./api/backend-client.js";
import type { SerializedInterview, SerializedStateSnapshot } from "./api/types.js";
import { loadHistory, recordHistory, type HistoryEntry } from "./history.js";
import { DevicesScreen } from "./screens/DevicesScreen.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { LiveScreen } from "./screens/LiveScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";
import { ResultsScreen } from "./screens/ResultsScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { formatApiError, useBackendClient, type LiveEvent } from "./state/use-interview.js";

type Phase = "setup" | "devices" | "lobby" | "live" | "results" | "history";

export function App() {
  const backend: BackendClient = useBackendClient();
  const [phase, setPhase] = useState<Phase>("setup");
  const [interview, setInterview] = useState<SerializedInterview | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<SerializedStateSnapshot | null>(null);
  const [events, setEvents] = useState<readonly LiveEvent[]>([]);
  const [stale, setStale] = useState(false);
  const [entries, setEntries] = useState<readonly HistoryEntry[]>(() => loadHistory(localStorage));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const remember = useCallback((entry: HistoryEntry) => {
    setEntries(recordHistory(localStorage, entry));
  }, []);

  function handleCreated(created: SerializedInterview) {
    setInterview(created);
    setFinalSnapshot(null);
    setEvents([]);
    setStale(false);
    remember({ id: created.id, candidateId: created.candidateId, status: created.status, at: new Date().toISOString() });
    setPhase("devices");
  }

  function handleFinished(snapshot: SerializedStateSnapshot | null, roomEvents: readonly LiveEvent[]) {
    setFinalSnapshot(snapshot);
    setEvents(roomEvents);
    setStale(false);
    if (interview !== null) {
      remember({
        id: interview.id,
        candidateId: interview.candidateId,
        status: snapshot?.interview.status ?? "completed",
        at: new Date().toISOString(),
      });
    }
    setPhase("results");
  }

  async function handleHistorySelect(entry: HistoryEntry) {
    setBusyId(entry.id);
    setHistoryError(null);
    try {
      const snapshot = await backend.getState(entry.id);
      setInterview(snapshot.interview);
      setFinalSnapshot(snapshot);
      setEvents([]);
      setStale(false);
      setPhase("results");
    } catch (e) {
      setHistoryError(`Could not load ${entry.id}: ${formatApiError(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  function resetToSetup() {
    setInterview(null);
    setFinalSnapshot(null);
    setEvents([]);
    setStale(false);
    setPhase("setup");
  }

  return (
    <main className="app">
      {phase === "setup" && <SetupScreen onCreated={handleCreated} onHistory={() => setPhase("history")} />}
      {phase === "devices" && (
        <DevicesScreen onPassed={() => setPhase("lobby")} onBack={() => setPhase("setup")} />
      )}
      {phase === "lobby" && interview !== null && (
        <LobbyScreen
          interview={interview}
          busy={false}
          error={null}
          onJoin={() => setPhase("live")}
          onBack={() => setPhase("setup")}
        />
      )}
      {phase === "live" && interview !== null && (
        <LiveScreen
          backend={backend}
          interview={interview}
          onFinished={handleFinished}
          onExit={() => setPhase("lobby")}
        />
      )}
      {phase === "results" && (
        <ResultsScreen
          backend={backend}
          snapshot={finalSnapshot}
          events={events}
          stale={stale}
          onHistory={() => setPhase("history")}
          onNew={resetToSetup}
        />
      )}
      {phase === "history" && (
        <>
          <HistoryScreen
            entries={entries}
            busyId={busyId}
            onSelect={handleHistorySelect}
            onNew={resetToSetup}
            onBack={() => setPhase(interview !== null && finalSnapshot !== null ? "results" : "setup")}
          />
          {historyError !== null && <p className="error">{historyError}</p>}
        </>
      )}
    </main>
  );
}
