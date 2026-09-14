// Render smoke tests (no DOM): every redesigned screen renders to a string
// without throwing. Effects do not run server-side, so the voice loop stays
// inert — this guards the component tree, not the realtime path.

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { BackendClient } from "../src/api/backend-client.js";
import type {
  SerializedEvaluation,
  SerializedInterview,
  SerializedStateSnapshot,
  SerializedUserProfile,
} from "../src/api/types.js";
import { AppShell } from "../src/components/AppShell.js";
import { App } from "../src/App.js";
import { BriefingScreen } from "../src/screens/BriefingScreen.js";
import { DashboardScreen } from "../src/screens/DashboardScreen.js";
import { EvaluatingScreen } from "../src/screens/EvaluatingScreen.js";
import { FeedbackDetailScreen } from "../src/screens/FeedbackDetailScreen.js";
import { HistoryScreen } from "../src/screens/HistoryScreen.js";
import { LiveScreen } from "../src/screens/LiveScreen.js";
import { OnboardingScreen } from "../src/screens/OnboardingScreen.js";
import { ProgressScreen } from "../src/screens/ProgressScreen.js";
import { CreateAccountScreen } from "../src/screens/CreateAccountScreen.js";
import { ProfileScreen } from "../src/screens/ProfileScreen.js";
import { ProfileForm } from "../src/components/ProfileForm.js";
import { ResultsScreen } from "../src/screens/ResultsScreen.js";
import { SettingsScreen } from "../src/screens/SettingsScreen.js";
import { SetupScreen } from "../src/screens/SetupScreen.js";
import { SignInScreen } from "../src/screens/SignInScreen.js";
import { TranscriptReviewScreen } from "../src/screens/TranscriptReviewScreen.js";
import { WeakAreasScreen } from "../src/screens/WeakAreasScreen.js";
import type { HistoryEntry } from "../src/history.js";

const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
} as Storage;

const backend = new BackendClient("http://localhost:3000", async () => ({ status: 200, json: async () => ({ ok: true }) }));

const interview: SerializedInterview = {
  id: "int_1",
  candidateId: "candidate",
  type: "dsa",
  status: "completed",
  configuration: { interviewType: "dsa", difficulty: "Hard", durationMinutes: 30, problemCount: 1 },
  problems: [{ problemId: "prob_3sum", order: 0 }],
  currentOrder: 0,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const evaluation: SerializedEvaluation = {
  id: "eval_1",
  interviewId: "int_1",
  dimensions: { correctness: { score: 8 }, communication: { score: 7.5 } },
  hintsUsed: 1,
  strengths: ["Clear API reasoning"],
  weaknesses: ["Complexity analysis"],
  recommendation: "hire",
  overallScore: 8.1,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const snapshot: SerializedStateSnapshot = {
  interview,
  currentProblem: null,
  responseCount: 3,
  evaluation,
};

const entries: readonly HistoryEntry[] = [
  {
    id: "int_1",
    candidateId: "candidate",
    status: "completed",
    at: new Date().toISOString(),
    interviewType: "Coding",
    difficulty: "Hard",
    mode: "Realistic Interview",
    durationMin: 32,
    overallScore: 8.1,
    recommendation: "hire",
    hintsUsed: 1,
    strengths: ["Clear"],
    weaknesses: ["Complexity analysis"],
    dimensions: { correctness: 8.1, communication: 7.9 },
  },
];

const noop = () => undefined;
const noopEntry = (_e: HistoryEntry) => undefined;

const profile: SerializedUserProfile = {
  userId: "user_1",
  interviewTypes: ["dsa"],
  role: "backend_engineer",
  level: "senior",
  goals: "Get sharper on dynamic programming",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("screen render smoke", () => {
  it("App renders the sign-in landing for a signed-out visitor", () => {
    const html = renderToString(<App />);
    expect(html).toContain("Interview Coach");
    expect(html).toContain("Sign in");
  });
  it("AppShell renders navigation + guest account control", () => {
    const html = renderToString(
      <AppShell active="dashboard" onNavigate={noop} onSignIn={noop} onProfile={noop} onSignOut={noop}>
        <p>content</p>
      </AppShell>,
    );
    expect(html).toContain("Interview History");
    expect(html).toContain("Sign in");
  });
  it("DashboardScreen renders", () => {
    expect(renderToString(<DashboardScreen entries={entries} onStart={noop} onHistory={noop} onOpen={noopEntry} />)).toContain("Start Interview");
  });
  it("SetupScreen renders", () => {
    expect(renderToString(<SetupScreen onCreated={noop} onCancel={noop} />)).toContain("New Interview");
  });
  it("BriefingScreen renders", () => {
    expect(renderToString(<BriefingScreen interview={interview} mode="Realistic Interview" interaction="Voice" onBegin={noop} onBack={noop} />)).toContain("You will be evaluated on");
  });
  it("LiveScreen renders the join state", () => {
    expect(renderToString(<LiveScreen backend={backend} interview={interview} mode="Guided Coaching" interaction="Voice" onFinished={noop} onExit={noop} />)).toContain("Joining the interview");
  });
  it("EvaluatingScreen renders", () => {
    expect(renderToString(<EvaluatingScreen />)).toContain("Analyzing Interview");
  });
  it("ResultsScreen renders scores", () => {
    const html = renderToString(
      <ResultsScreen backend={backend} snapshot={snapshot} events={[]} onHistory={noop} onNew={noop} onTranscript={noop} onWeakAreas={noop} onFeedback={noop} />,
    );
    expect(html).toContain("Technical correctness");
    expect(html).toContain("Strong");
  });
  it("ResultsScreen handles a null snapshot", () => {
    expect(
      renderToString(
        <ResultsScreen backend={backend} snapshot={null} events={[]} onHistory={noop} onNew={noop} onTranscript={noop} onWeakAreas={noop} onFeedback={noop} />,
      ),
    ).toContain("Results");
  });
  it("FeedbackDetailScreen renders", () => {
    expect(renderToString(<FeedbackDetailScreen evaluation={evaluation} onBack={noop} />)).toContain("Strengths");
  });
  it("TranscriptReviewScreen renders", () => {
    expect(renderToString(<TranscriptReviewScreen interview={interview} events={[]} onBack={noop} />)).toContain("Interview transcript");
  });
  it("HistoryScreen renders", () => {
    expect(renderToString(<HistoryScreen entries={entries} busyId={null} onSelect={noopEntry} onNew={noop} onBack={noop} />)).toContain("Interview History");
  });
  it("ProgressScreen renders", () => {
    expect(renderToString(<ProgressScreen entries={entries} onWeakAreas={noop} onNew={noop} />)).toContain("Overall performance");
  });
  it("WeakAreasScreen renders", () => {
    expect(renderToString(<WeakAreasScreen entries={entries} onPractice={noop} onBack={noop} />)).toContain("Recommended practice");
  });
  it("SettingsScreen renders the account section", () => {
    const html = renderToString(
      <SettingsScreen entries={entries} onHistoryCleared={noop} onSignIn={noop} onCreateAccount={noop} onSignOut={noop} />,
    );
    expect(html).toContain("Settings");
    expect(html).toContain("Account");
  });
  it("SignInScreen renders", () => {
    expect(renderToString(<SignInScreen backend={backend} onSuccess={noop} onGoCreate={noop} />)).toContain("Create one");
  });
  it("CreateAccountScreen renders", () => {
    expect(renderToString(<CreateAccountScreen backend={backend} onSuccess={noop} onGoSignIn={noop} />)).toContain("Create account");
  });
  it("OnboardingScreen renders the required profile form", () => {
    const html = renderToString(<OnboardingScreen backend={backend} onComplete={noop} />);
    expect(html).toContain("Set up your profile");
    expect(html).toContain("Save and continue");
  });
  it("ProfileForm renders for a new user with the taxonomy", () => {
    const html = renderToString(
      <ProfileForm submitLabel="Save and continue" busy={false} error={null} onSubmit={noop} />,
    );
    expect(html).toContain("Data Structures &amp; Algorithms");
    expect(html).toContain("Backend Engineer");
  });
  it("ProfileScreen renders the saved profile", () => {
    const html = renderToString(
      <ProfileScreen
        backend={backend}
        identity={{ displayName: "Ada", email: "ada@example.com" }}
        profile={profile}
        onSaved={noop}
        onBack={noop}
        onSettings={noop}
        onSignOut={noop}
      />,
    );
    expect(html).toContain("Edit profile");
    expect(html).toContain("Backend Engineer");
  });
});
