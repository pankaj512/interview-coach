// Render smoke tests (no DOM): every redesigned screen renders to a string
// without throwing. Effects do not run server-side, so the voice loop stays
// inert — this guards the component tree, not the realtime path.

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { BackendClient } from "../src/api/backend-client.js";
import type {
  Problem,
  SerializedCurriculum,
  SerializedEvaluation,
  SerializedInterview,
  SerializedRecommendation,
  SerializedStateSnapshot,
  SerializedUserProfile,
} from "../src/api/types.js";
import type { DashboardData } from "../src/state/use-dashboard.js";
import { AppShell } from "../src/components/AppShell.js";
import { App } from "../src/App.js";
import type { SessionPlan } from "../src/flow.js";
import { DashboardScreen } from "../src/screens/DashboardScreen.js";
import { EvaluatingScreen } from "../src/screens/EvaluatingScreen.js";
import { FeedbackDetailScreen } from "../src/screens/FeedbackDetailScreen.js";
import { HistoryScreen } from "../src/screens/HistoryScreen.js";
import { LiveScreen } from "../src/screens/LiveScreen.js";
import { LobbyScreen } from "../src/screens/LobbyScreen.js";
import { OnboardingScreen } from "../src/screens/OnboardingScreen.js";
import { ProblemPanel } from "../src/components/ProblemPanel.js";
import { ProgressScreen } from "../src/screens/ProgressScreen.js";
import { CreateAccountScreen } from "../src/screens/CreateAccountScreen.js";
import { ProfileScreen } from "../src/screens/ProfileScreen.js";
import { ProfileForm } from "../src/components/ProfileForm.js";
import { ResultsScreen } from "../src/screens/ResultsScreen.js";
import { SettingsScreen } from "../src/screens/SettingsScreen.js";
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
  evaluationStatus: "none",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const evaluation: SerializedEvaluation = {
  id: "eval_1",
  interviewId: "int_1",
  status: "completed",
  source: "llm",
  dimensions: { coding: { score: 8 }, communication: { score: 7.5 } },
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
    evaluationStatus: "completed",
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
    dimensions: { coding: 8.1, communication: 7.9 },
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

const dashboardCurriculum: SerializedCurriculum = {
  id: "dsa",
  interviewType: "dsa",
  name: "DSA Interview Curriculum",
  version: 1,
  modules: [{ id: "mod_1", curriculumId: "dsa", order: 1, name: "Foundations", topicIds: ["topic_arrays"] }],
  topics: [
    { id: "topic_arrays", curriculumId: "dsa", moduleId: "mod_1", order: 1, name: "Arrays", problemIds: ["prob_move-zeroes"] },
  ],
};

const dashboardRecommendation: SerializedRecommendation = {
  id: "rec_1",
  userId: "user_1",
  curriculumId: "dsa",
  recommendationType: "new_topic",
  topicId: "topic_arrays",
  problemId: "prob_move-zeroes",
  reason: "Start with array fundamentals.",
  source: "fallback",
  status: "active",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const dashboardProblem: Problem = { id: "prob_move-zeroes", title: "Move Zeroes", difficulty: "Easy" };

const lobbyPlan: SessionPlan = {
  interview,
  recommendation: dashboardRecommendation,
  problem: dashboardProblem,
  curriculum: dashboardCurriculum,
  mode: "Realistic Interview",
  interaction: "Voice",
  durationMinutes: 30,
  difficulty: "Easy",
};

const dashboardData: DashboardData = {
  state: "ready",
  recommendation: dashboardRecommendation,
  problem: dashboardProblem,
  curriculum: dashboardCurriculum,
  skills: [],
  progress: null,
  error: null,
  busy: false,
  reload: async () => undefined,
  regenerate: async () => undefined,
};

describe("screen render smoke", () => {
  it("App renders the sign-in landing for a signed-out visitor", () => {
    const html = renderToString(<App />);
    expect(html).toContain("Interview Coach");
    expect(html).toContain("Start practicing free");
    expect(html).toContain("Sample results");
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
  it("DashboardScreen renders the recommendation CTA and progress", () => {
    const html = renderToString(
      <DashboardScreen
        profile={profile}
        data={dashboardData}
        starting={false}
        onStart={noop}
        onProfile={noop}
      />,
    );
    expect(html).toContain("Preparing for");
    expect(html).toContain("Start practice");
    expect(html).toContain("Curriculum progress");
    expect(html).toContain("Senior Backend Engineer");
  });
  it("LobbyScreen renders the recommendation and session prep", () => {
    const html = renderToString(
      <LobbyScreen backend={backend} plan={lobbyPlan} onBegin={noop} onChangeGoal={noop} onBack={noop} />,
    );
    expect(html).toContain("Arrays");
    expect(html).toContain("Move Zeroes");
    expect(html).toContain("Preparing your interview");
    expect(html).toContain("Setup checks");
    expect(html).toContain("Begin interview");
  });
  it("LiveScreen renders the join state", () => {
    expect(renderToString(<LiveScreen backend={backend} interview={interview} mode="Guided Coaching" interaction="Voice" onFinished={noop} onExit={noop} />)).toContain("Joining the interview");
  });
  it("ProblemPanel shows the lobby problem before the first snapshot", () => {
    const html = renderToString(<ProblemPanel snapshot={null} fallbackProblem={dashboardProblem} />);
    expect(html).toContain("Move Zeroes");
    expect(html).not.toContain("Loading interview state");
  });
  it("EvaluatingScreen renders", () => {
    const html = renderToString(<EvaluatingScreen />);
    expect(html).toContain("Analyzing your interview");
    expect(html).toContain("Scoring 7 dimensions");
  });
  it("EvaluatingScreen surfaces evaluation failure without losing the interview", () => {
    const html = renderToString(<EvaluatingScreen error="Scoring failed." />);
    expect(html).toContain("Scoring failed.");
    expect(html).toContain("Your interview is saved");
  });
  it("ResultsScreen renders scores", () => {
    const html = renderToString(
      <ResultsScreen backend={backend} snapshot={snapshot} events={[]} onHistory={noop} onNew={noop} onTranscript={noop} onWeakAreas={noop} onFeedback={noop} />,
    );
    expect(html).toContain("Coding accuracy");
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
    expect(
      renderToString(
        <HistoryScreen
          entries={entries}
          busyId={null}
          deletingId={null}
          loading={false}
          hasMore={false}
          onSelect={noopEntry}
          onDelete={noopEntry}
          onLoadMore={noop}
          onNew={noop}
          onBack={noop}
        />,
      ),
    ).toContain("Interview History");
  });
  it("ProgressScreen renders", () => {
    expect(
      renderToString(
        <ProgressScreen
          entries={entries}
          data={dashboardData}
          starting={false}
          onWeakAreas={noop}
          onStartRecommendation={noop}
          onNew={noop}
        />,
      ),
    ).toContain("Overall performance");
  });
  it("WeakAreasScreen renders", () => {
    expect(
      renderToString(
        <WeakAreasScreen
          entries={entries}
          skills={dashboardData.skills}
          curriculum={dashboardData.curriculum}
          onPractice={noop}
          onBack={noop}
        />,
      ),
    ).toContain("Recommended practice");
  });
  it("SettingsScreen renders the account section", () => {
    const html = renderToString(
      <SettingsScreen entries={entries} onHistoryCleared={noop} onSignIn={noop} onCreateAccount={noop} onSignOut={noop} />,
    );
    expect(html).toContain("Settings");
    expect(html).toContain("Account");
  });
  it("SignInScreen renders", () => {
    const html = renderToString(<SignInScreen backend={backend} onSuccess={noop} onGoCreate={noop} />);
    expect(html).toContain("Create one");
    expect(html).toContain("Sign in");
    // Empty credentials keep the submit disabled (validation state).
    expect(html).toContain("disabled");
  });
  it("CreateAccountScreen renders", () => {
    const html = renderToString(<CreateAccountScreen backend={backend} onSuccess={noop} onGoSignIn={noop} />);
    expect(html).toContain("Create account");
    // Empty fields keep the submit disabled (validation state).
    expect(html).toContain("disabled");
  });
  it("OnboardingScreen renders the required profile form", () => {
    const html = renderToString(<OnboardingScreen backend={backend} onComplete={noop} />);
    expect(html).toContain("interview preferences");
    expect(html).toContain("Save and continue");
    expect(html).toContain("Step 2 of 4");
  });
  it("ProfileForm renders for a new user with the taxonomy", () => {
    const html = renderToString(
      <ProfileForm submitLabel="Save and continue" busy={false} error={null} onSubmit={noop} />,
    );
    expect(html).toContain("Data Structures &amp; Algorithms");
    expect(html).toContain("Backend Engineer");
  });
  it("ProfileForm surfaces a validation error with an alert role", () => {
    const html = renderToString(
      <ProfileForm submitLabel="Save and continue" busy={false} error="Role is required." onSubmit={noop} />,
    );
    expect(html).toContain("Role is required.");
    expect(html).toContain('role="alert"');
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
