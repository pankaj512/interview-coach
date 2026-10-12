// Render smoke tests (no DOM): every redesigned screen renders to a string
// without throwing. Effects do not run server-side, so the voice loop stays
// inert - this guards the component tree, not the realtime path.

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { BackendClient } from "../src/api/backend-client.js";
import type {
  ProblemContent,
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
import { HistoryScreen } from "../src/screens/HistoryScreen.js";
import { LandingScreen } from "../src/screens/LandingScreen.js";
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
import { TranscriptReviewScreen, transcriptTurns } from "../src/screens/TranscriptReviewScreen.js";
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
  dimensions: {
    coding: { score: 4, notes: "Clean loop, in-place as required." },
    communication: { score: 3, notes: "Narrated the happy path; went quiet on edge cases." },
    testing_debugging: { score: 4, notes: "Ran the sample suite." },
  },
  hintsUsed: 1,
  strengths: ["Clear API reasoning"],
  weaknesses: ["Complexity analysis"],
  recommendation: "lean_hire",
  overallScore: 81,
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
    overallScore: 81,
    recommendation: "hire",
    hintsUsed: 1,
    strengths: ["Clear"],
    weaknesses: ["Complexity analysis"],
    dimensions: { coding: 4, communication: 3.5 },
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

const dashboardProblem: ProblemContent = {
  id: "prob_move-zeroes",
  title: "Move Zeroes",
  difficulty: "Easy",
  description: null,
  constraints: null,
  examples: null,
  starters: null,
  runnerLinks: null,
};

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
    expect(html).toContain("Profile");
    expect(html).toContain("Sign in");
    expect(html).toContain("shell-nav-active");
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
  it("ProblemPanel prefers the 18c content slice and lists every example", () => {
    const html = renderToString(
      <ProblemPanel
        snapshot={null}
        fallbackProblem={dashboardProblem}
        content={{
          id: "prob_move-zeroes",
          title: "Move Zeroes",
          difficulty: "Easy",
          description: "Move all zeroes to the end.",
          constraints: ["1 <= n <= 10^4"],
          examples: [
            { input: "nums = [0,1]", output: "[1,0]" },
            { input: "nums = [0]", output: "[0]" },
          ],
          starters: null,
          runnerLinks: null,
        }}
      />,
    );
    expect(html).toContain("Move all zeroes to the end.");
    expect(html).toContain("1 &lt;= n");
    expect(html).toContain("sample 1");
    expect(html).toContain("sample 2");
  });
  it("ProblemPanel falls back to title-only for gap content and while loading", () => {
    const gap = renderToString(
      <ProblemPanel
        snapshot={null}
        fallbackProblem={dashboardProblem}
        content={{ id: "prob_move-zeroes", title: "Move Zeroes", difficulty: "Easy", description: null, constraints: null, examples: null, starters: null, runnerLinks: null }}
      />,
    );
    expect(gap).toContain("Move Zeroes");
    expect(gap).toContain("No description available for this problem yet.");
    const loading = renderToString(
      <ProblemPanel snapshot={null} fallbackProblem={dashboardProblem} content={undefined} />,
    );
    expect(loading).toContain("Loading full statement...");
  });
  it("ProblemPanel splits statement paragraphs, blocks judge code, and shows explanations", () => {
    const html = renderToString(
      <ProblemPanel
        snapshot={null}
        fallbackProblem={dashboardProblem}
        content={{
          id: "prob_remove-duplicates",
          title: "Remove Duplicates from Sorted Array",
          difficulty: "Easy",
          description:
            "First paragraph.\n\nSecond paragraph.\n\nint k = removeDuplicates(nums); // Calls it\nassert k == 2;",
          constraints: ["1 <= n <= 10^4"],
          examples: [
            { input: "nums = [1,1,2]", output: "2", explanation: "It does not matter what you leave beyond k." },
            { input: "nums = [0]", output: "[0]" },
          ],
          starters: null,
          runnerLinks: null,
        }}
      />,
    );
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
    expect(html).toContain("<pre>");
    expect(html).toContain("Sample 1: It does not matter what you leave beyond k.");
    expect(html).not.toContain("Sample 2:");
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
      <ResultsScreen backend={backend} snapshot={snapshot} onHistory={noop} onNew={noop} onTranscript={noop} onWeakAreas={noop} />,
    );
    expect(html).toContain("Interview Results");
    expect(html).toContain("81");
    expect(html).toContain("/ 100");
    expect(html).toContain("Solid");
    expect(html).toContain("lean hire");
    expect(html).toContain("Coding accuracy");
    expect(html).toContain("Testing &amp; debugging");
    expect(html).not.toContain(">testing_debugging<");
    expect(html).toContain("data-dim-key=\"coding\"");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).toContain("dim-chev");
    expect(html).not.toContain("responses");
    expect(html).toContain("/ 5");
    expect(html).toContain("aria-label=\"Coding accuracy, 4 out of 5, show feedback\"");
  });
  it("ResultsScreen handles a null snapshot", () => {
    expect(
      renderToString(
        <ResultsScreen backend={backend} snapshot={null} onHistory={noop} onNew={noop} onTranscript={noop} onWeakAreas={noop} />,
      ),
    ).toContain("Results");
  });
  it("TranscriptReviewScreen renders live turns", () => {
    const html = renderToString(
      <TranscriptReviewScreen
        backend={backend}
        interview={interview}
        events={[
          { at: new Date(0).toISOString(), kind: "assistant", detail: "How would you approach it?" },
          { at: new Date(60_000).toISOString(), kind: "candidate", detail: "Two pointers." },
        ]}
        onWeakAreas={noop}
        onBack={noop}
      />,
    );
    expect(html).toContain("How the session read");
    expect(html).toContain("How would you approach it?");
    expect(html).toContain("Two pointers.");
    expect(html).toContain("Export transcript");
    expect(html).toContain("Practice weak areas");
  });
  it("transcriptTurns prefers live events and skips server system rows", () => {
    const live = transcriptTurns(
      [{ at: "t1", kind: "candidate", detail: "Live answer." }],
      [{ id: "m1", interviewId: "int_1", role: "candidate", content: "Server answer.", createdAt: "t0" }],
    );
    expect(live.map((t) => t.text)).toEqual(["Live answer."]);
    const server = transcriptTurns([], [
      { id: "m1", interviewId: "int_1", role: "system", content: "Setup.", createdAt: "t0" },
      { id: "m2", interviewId: "int_1", role: "interviewer", content: "Go on.", createdAt: "t1" },
      { id: "m3", interviewId: "int_1", role: "candidate", content: "Done.", createdAt: "t2" },
    ]);
    expect(server.map((t) => `${t.role}:${t.text}`)).toEqual(["Interviewer:Go on.", "You:Done."]);
  });
  it("HistoryScreen renders without a score placeholder for unevaluated entries", () => {
    const first = entries[0];
    if (first === undefined) throw new Error("history fixture missing");
    const { overallScore: _omitScore, ...unscored } = first;
    const html = renderToString(
      <HistoryScreen
        entries={[first, { ...unscored, id: "int_2" }]}
        busyId={null}
        deletingId={null}
        loading={false}
        hasMore={false}
        onSelect={noopEntry}
        onDelete={noopEntry}
        onLoadMore={noop}
        onNew={noop}
      />,
    );
    expect(html).toContain("Interview history");
    expect(html).toContain("Start new interview");
    expect(html.match(/81 \/ 100/g)).toHaveLength(1);
    expect(html).not.toContain("—");
    expect(html).toContain("2 sessions");
  });
  it("ProgressScreen renders actions without the recommendation banner", () => {
    const html = renderToString(
      <ProgressScreen
        entries={entries}
        data={dashboardData}
        starting={false}
        onWeakAreas={noop}
        onStartRecommendation={noop}
      />,
    );
    expect(html).toContain("Overall performance");
    expect(html).toContain("Recommended practice");
    expect(html).toContain("Overall trend");
    expect(html).toContain("prog-grid");
    expect(html).toContain("hero-number");
    expect(html).not.toContain("Start recommended");
  });
  it("WeakAreasScreen renders one card per weak dimension", () => {
    const weakEntries: readonly HistoryEntry[] = entries.map((e) => ({
      ...e,
      dimensions: { complexity_analysis: 2, testing_debugging: 3, independence: 4 },
    }));
    const html = renderToString(
      <WeakAreasScreen
        entries={weakEntries}
        skills={dashboardData.skills}
        curriculum={dashboardData.curriculum}
        onPractice={noop}
        onBack={noop}
      />,
    );
    expect(html).toContain("Recommended practice");
    expect(html).toContain("complexity_analysis");
    expect(html).toContain("/5");
    expect(html).toContain("Complexity analysis");
    expect(html.match(/>Practice</g)).toHaveLength(3);
  });
  it("SettingsScreen renders the account section", () => {
    const html = renderToString(
      <SettingsScreen entries={entries} deletingAll={false} onDeleteAll={noop} resettingAll={false} onResetAll={noop} onSignIn={noop} onCreateAccount={noop} onSignOut={noop} />,
    );
    expect(html).toContain("Settings");
    expect(html).toContain("Account");
    expect(html).toContain("Interviewer voice");
    // No implementation leaks: the dropdown shows the real default voice,
    // and no copy mentions the server.
    expect(html).toContain("Delete interviews");
    expect(html).toContain("Reset learning state");
    expect(html).not.toContain("Reload interviews");
    expect(html).not.toContain("Server default");
    expect(html).not.toContain("server");
  });
  it("SignInScreen renders", () => {
    const html = renderToString(<SignInScreen backend={backend} onSuccess={noop} onGoCreate={noop} />);
    expect(html).toContain("Create one");
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Back");
    // Empty credentials keep the submit disabled (validation state).
    expect(html).toContain("disabled");
  });
  it("SignInScreen renders Back only with onBack", () => {
    const html = renderToString(<SignInScreen backend={backend} onSuccess={noop} onGoCreate={noop} onBack={noop} />);
    expect(html).toContain("Back");
  });
  it("CreateAccountScreen renders", () => {
    const html = renderToString(<CreateAccountScreen backend={backend} onSuccess={noop} onGoSignIn={noop} />);
    expect(html).toContain("Create account");
    expect(html).not.toContain("Back");
    // Empty fields keep the submit disabled (validation state).
    expect(html).toContain("disabled");
  });
  it("CreateAccountScreen renders Back only with onBack", () => {
    const html = renderToString(<CreateAccountScreen backend={backend} onSuccess={noop} onGoSignIn={noop} onBack={noop} />);
    expect(html).toContain("Back");
  });
  it("LandingScreen renders the auth modal only when open", () => {
    const base = {
      onSignIn: noop,
      onCreateAccount: noop,
      onDevGuest: noop,
      showDevGuest: false,
      authModalLabel: "Sign in",
      onCloseAuth: noop,
    };
    const closed = renderToString(<LandingScreen {...base} authModal={null} />);
    expect(closed).not.toContain("auth-dialog");
    const open = renderToString(
      <LandingScreen
        {...base}
        authModal={<SignInScreen backend={backend} onSuccess={noop} onGoCreate={noop} />}
      />,
    );
    expect(open).toContain("auth-dialog");
    expect(open).toContain("Welcome back");
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
  it("ProfileScreen renders the inline editor with Save hidden until edited", () => {
    const html = renderToString(
      <ProfileScreen
        backend={backend}
        identity={{ displayName: "Ada", email: "ada@example.com" }}
        profile={profile}
        onSaved={noop}
      />,
    );
    expect(html).toContain("What are you preparing for?");
    expect(html).toContain("Backend Engineer");
    expect(html).not.toContain("auth-card");
    expect(html).not.toContain("Save changes");
    expect(html).not.toContain("Account and interview goals");
  });
});
