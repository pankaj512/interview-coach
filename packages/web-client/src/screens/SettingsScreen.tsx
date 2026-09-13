// H-Settings (ux-spec §30): General / Voice / Interview / AI / Privacy.

import { useState } from "react";
import { AccountSection } from "../components/AccountSection.js";
import { DangerButton, GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Card, Segmented } from "../ds/primitives.js";
import { clearHistory, type HistoryEntry } from "../history.js";

interface Settings {
  theme: "Dark" | "Light";
  language: "English (US)" | "English (UK)";
  notifications: boolean;
  defaultDuration: number;
  defaultMode: "Realistic Interview" | "Guided Coaching";
  defaultDifficulty: "Easy" | "Medium" | "Hard";
  autoTranscript: boolean;
  feedback: "Detailed" | "Concise";
  retentionDays: number;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "Dark",
  language: "English (US)",
  notifications: true,
  defaultDuration: 30,
  defaultMode: "Realistic Interview",
  defaultDifficulty: "Medium",
  autoTranscript: true,
  feedback: "Detailed",
  retentionDays: 30,
};

const SETTINGS_KEY = "ic.settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

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
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [speakerTested, setSpeakerTested] = useState(false);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // best-effort
      }
      return next;
    });
  }

  async function testSpeaker() {
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      osc.frequency.value = 440;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      await new Promise((resolve) => setTimeout(resolve, 350));
      osc.stop();
      await ctx.close().catch(() => undefined);
      setSpeakerTested(true);
    } catch {
      // ignore
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "interview-coach-history.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <AccountSection onSignIn={onSignIn} onCreateAccount={onCreateAccount} onSignOut={onSignOut} />

      <Card className="settings-section">
        <h3 className="section-title">General</h3>
        <div className="setting-row">
          <span>Theme</span>
          <Segmented options={["Dark", "Light"] as const} value={settings.theme} onChange={(v) => update("theme", v)} ariaLabel="Theme" />
        </div>
        <div className="setting-row">
          <span>Language</span>
          <Segmented options={["English (US)", "English (UK)"] as const} value={settings.language} onChange={(v) => update("language", v)} ariaLabel="Language" />
        </div>
        <div className="setting-row">
          <span>Notifications</span>
          <label className="switch">
            <input type="checkbox" checked={settings.notifications} onChange={(e) => update("notifications", e.target.checked)} />
            Interview reminders
          </label>
        </div>
        <div className="setting-row">
          <span>Default interview duration</span>
          <select value={settings.defaultDuration} onChange={(e) => update("defaultDuration", Number(e.target.value))}>
            {[15, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="settings-section">
        <h3 className="section-title">Voice</h3>
        <div className="setting-row">
          <span>Microphone</span>
          <span className="hint">Default system input</span>
        </div>
        <div className="setting-row">
          <span>Speaker</span>
          <span className="hint">Default system output</span>
        </div>
        <div className="setting-row">
          <span>Voice</span>
          <span className="hint">Andrew (DragonHD)</span>
        </div>
        <div className="setting-row">
          <span>Test microphone</span>
          <GhostButton onClick={() => void testSpeaker()}>Play test tone</GhostButton>
        </div>
        {speakerTested && <p className="hint">Test tone played — you should have heard it.</p>}
      </Card>

      <Card className="settings-section">
        <h3 className="section-title">Interview</h3>
        <div className="setting-row">
          <span>Default mode</span>
          <Segmented
            options={["Realistic Interview", "Guided Coaching"] as const}
            value={settings.defaultMode}
            onChange={(v) => update("defaultMode", v)}
            ariaLabel="Default mode"
          />
        </div>
        <div className="setting-row">
          <span>Default difficulty</span>
          <Segmented options={["Easy", "Medium", "Hard"] as const} value={settings.defaultDifficulty} onChange={(v) => update("defaultDifficulty", v)} ariaLabel="Default difficulty" />
        </div>
        <div className="setting-row">
          <span>Automatic transcript</span>
          <label className="switch">
            <input type="checkbox" checked={settings.autoTranscript} onChange={(e) => update("autoTranscript", e.target.checked)} />
            On
          </label>
        </div>
        <div className="setting-row">
          <span>Feedback preferences</span>
          <Segmented options={["Detailed", "Concise"] as const} value={settings.feedback} onChange={(v) => update("feedback", v)} ariaLabel="Feedback preferences" />
        </div>
      </Card>

      <Card className="settings-section">
        <h3 className="section-title">AI</h3>
        <div className="setting-row">
          <span>Provider</span>
          <span className="hint">Azure Voice Live (managed)</span>
        </div>
        <div className="setting-row">
          <span>Model</span>
          <span className="hint">gpt-realtime-mini</span>
        </div>
        <div className="setting-row">
          <span>Endpoint</span>
          <span className="hint">Server-managed — credentials never leave the backend</span>
        </div>
      </Card>

      <Card className="settings-section">
        <h3 className="section-title">Privacy</h3>
        <div className="setting-row">
          <span>Transcript retention</span>
          <select value={settings.retentionDays} onChange={(e) => update("retentionDays", Number(e.target.value))}>
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <span>Delete interview history</span>
          <DangerButton
            onClick={() => {
              clearHistory(localStorage);
              onHistoryCleared();
            }}
          >
            Clear local history
          </DangerButton>
        </div>
        <div className="setting-row">
          <span>Export data</span>
          <PrimaryButton onClick={exportData}>Download JSON</PrimaryButton>
        </div>
      </Card>
    </>
  );
}
