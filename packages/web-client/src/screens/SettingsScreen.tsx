// H-Settings (ux-spec §30): every setting performs a real action or it is
// not here. Account identity, profile management, and data (export/refresh)
// over the server-owned record. No local-only preference cards: the former
// General / Voice / Interview / AI controls were write-only `ic.settings`
// localStorage with zero readers anywhere in the client.

import { useEffect, useState } from "react";
import { AccountSection } from "../components/AccountSection.js";
import { GhostButton } from "../ds/buttons.js";
import { Card } from "../ds/primitives.js";
import { DEFAULT_VOICE, loadVoicePreference, REALTIME_VOICES, saveVoicePreference } from "../voice/voice-prefs.js";
import type { HistoryEntry } from "../history.js";

export function SettingsScreen({
  entries,
  onHistoryCleared,
  onSignIn,
  onCreateAccount,
  onSignOut,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly onHistoryCleared: () => void;
  readonly onSignIn: () => void;
  readonly onCreateAccount: () => void;
  readonly onSignOut: () => void;
}) {
  const [exportError, setExportError] = useState<string | null>(null);
  // Unset preference shows the service default voice, not a placeholder:
  // the dropdown always reflects the voice interviews will actually use.
  const [voice, setVoice] = useState<string>(() => loadVoicePreference() ?? DEFAULT_VOICE);

  useEffect(() => {
    setExportError(null);
  }, [entries.length]);

  function exportJson() {
    try {
      const payload = JSON.stringify({ exportedAt: new Date().toISOString(), interviews: entries }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "interviewcoach-history.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      } catch {
      setExportError("Export failed in this browser. Your history is unchanged.");
    }
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <AccountSection onSignIn={onSignIn} onCreateAccount={onCreateAccount} onSignOut={onSignOut} />
      <Card className="settings-section">
        <h2 className="section-title">Voice</h2>
        <p className="hint">Applies to voice interviews.</p>
        <div className="setting-row">
          <label htmlFor="settings-voice">Interviewer voice</label>
          <select
            id="settings-voice"
            value={voice}
            onChange={(e) => {
              setVoice(e.target.value);
              saveVoicePreference(e.target.value);
            }}
          >
            {REALTIME_VOICES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </Card>
      <Card className="settings-section">
        <h2 className="section-title">Privacy &amp; data</h2>
        <p className="hint">
          Interviews are saved to your account. Transcripts are kept so scores, feedback, and progress stay
          consistent; deleting an interview from History removes it permanently.
        </p>
        <div className="setting-row">
          <span>Export interviews</span>
          <GhostButton onClick={exportJson}>Export JSON</GhostButton>
        </div>
        <div className="setting-row">
          <span>Interview history</span>
          <GhostButton onClick={onHistoryCleared}>Reload interviews</GhostButton>
        </div>
        {exportError !== null && (
          <p className="error" role="alert">
            {exportError}
          </p>
        )}
      </Card>
    </>
  );
}
