// Settings with only real actions.
//
// Owns: account, profile, and data actions over the server-owned record.
// Surprising: no local-only preference cards (the former write-only
// localStorage controls had zero readers).
//
// History: 17d; see docs/SESSION_HANDOFF.md.

import { useEffect, useState } from "react";
import { AccountSection } from "../components/AccountSection.js";
import { DangerButton, GhostButton } from "../ds/buttons.js";
import { Card, Dialog } from "../ds/primitives.js";
import { DEFAULT_VOICE, loadVoicePreference, REALTIME_VOICES, saveVoicePreference } from "../voice/voice-prefs.js";
import type { HistoryEntry } from "../history.js";

export function SettingsScreen({
  entries,
  deletingAll,
  onDeleteAll,
  resettingAll,
  onResetAll,
  onSignIn,
  onCreateAccount,
  onSignOut,
}: {
  readonly entries: readonly HistoryEntry[];
  readonly deletingAll: boolean;
  readonly onDeleteAll: () => void;
  readonly resettingAll: boolean;
  readonly onResetAll: () => void;
  readonly onSignIn: () => void;
  readonly onCreateAccount: () => void;
  readonly onSignOut: () => void;
}) {
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
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
          <span>
            Interview history{" "}
            <span className="hint">Delete interviews clears all history permanently.</span>
          </span>
          <DangerButton onClick={() => setConfirmingDelete(true)} disabled={entries.length === 0 || deletingAll}>
            {deletingAll ? "Deleting..." : "Delete interviews"}
          </DangerButton>
        </div>
        <div className="setting-row">
          <span>
            Learning state{" "}
            <span className="hint">
              Reset recommendations, skill levels, and progress. Interviews stay.
            </span>
          </span>
          <DangerButton onClick={() => setConfirmingReset(true)} disabled={resettingAll || deletingAll}>
            {resettingAll ? "Resetting..." : "Reset learning state"}
          </DangerButton>
        </div>
        {exportError !== null && (
          <p className="error" role="alert">
            {exportError}
          </p>
        )}
      </Card>
      {confirmingDelete && (
        <Dialog
          title="Delete all interviews?"
          onClose={() => setConfirmingDelete(false)}
          actions={
            <>
              <GhostButton onClick={() => setConfirmingDelete(false)}>Keep interviews</GhostButton>
              <DangerButton
                onClick={() => {
                  setConfirmingDelete(false);
                  onDeleteAll();
                }}
              >
                Delete interviews
              </DangerButton>
            </>
          }
        >
          <p>
            This permanently clears your interview history, including scores, feedback, and progress. This
            cannot be undone.
          </p>
        </Dialog>
      )}
      {confirmingReset && (
        <Dialog
          title="Reset learning state?"
          onClose={() => setConfirmingReset(false)}
          actions={
            <>
              <GhostButton onClick={() => setConfirmingReset(false)}>Keep learning state</GhostButton>
              <DangerButton
                onClick={() => {
                  setConfirmingReset(false);
                  onResetAll();
                }}
              >
                Reset learning state
              </DangerButton>
            </>
          }
        >
          <p>
            This permanently clears your recommendations, skill levels, and curriculum progress, and the
            dashboard starts fresh. Your interview history is untouched. This cannot be undone.
          </p>
        </Dialog>
      )}
    </>
  );
}
