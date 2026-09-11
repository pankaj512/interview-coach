// @interview-coach/web-client — app shell (S4: setup -> live -> done).
//
// Thin screen router. Interview state transitions happen in hooks against the
// backend; this component only tracks which screen is visible.

import { useState } from "react";
import type { SerializedInterview } from "./api/types.js";
import { InterviewRoom } from "./components/InterviewRoom.js";
import { SetupForm } from "./components/SetupForm.js";
import { useBackendClient } from "./state/use-interview.js";

export function App() {
  const backend = useBackendClient();
  const [interview, setInterview] = useState<SerializedInterview | null>(null);

  return (
    <main className="app">
      <header className="app-header">
        <h1>Interview Coach</h1>
        <p className="hint">Realtime DSA voice interviews — backend owns truth, model owns conversation.</p>
      </header>
      {interview === null ? (
        <SetupForm onReady={setInterview} />
      ) : (
        <InterviewRoom backend={backend} interview={interview} onExit={() => setInterview(null)} />
      )}
    </main>
  );
}
