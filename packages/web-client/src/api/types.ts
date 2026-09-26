// @interview-coach/web-client — backend API shapes (S4).
//
// Structural mirrors of the S3 serializers (packages/backend/src/*.ts). The
// web client deliberately does NOT depend on @interview-coach/domain: domain
// pulls `node:crypto`, which must never enter the browser bundle. Backend
// owns truth; these types are read-only views of backend-owned state.

export type InterviewStatus =
  | "created"
  | "ready"
  | "in_progress"
  | "paused"
  | "completing"
  | "completed"
  | "cancelled"
  | "failed";

export type EvaluationStatus = "none" | "pending" | "completed" | "failed";

// Phase 8: canonical realtime tool contract (ADR-002 decision 11). The web
// model is advertised only the canonical names; the deprecated aliases stay
// accepted by the forwarder/backend for CLI-harness compatibility.
export type CanonicalToolName =
  | "get_current_interview"
  | "get_current_problem"
  | "get_candidate_code"
  | "get_last_submission"
  | "submit_interview_data"
  | "end_interview";

export type DeprecatedToolAlias =
  | "get_interview_state"
  | "get_candidate_performance"
  | "get_interview_configuration"
  | "get_problem_hint"
  | "record_candidate_answer"
  | "submit_solution"
  | "run_code";

export type ToolName = CanonicalToolName | DeprecatedToolAlias;

// Raw model- or UI-supplied tool arguments (sent as `arguments` to tool-exec).
export type ToolArgs = Record<string, unknown>;

export interface InterviewConfiguration {
  readonly interviewType: "dsa";
  readonly difficulty?: "Easy" | "Medium" | "Hard" | "Mixed";
  readonly durationMinutes?: number;
  readonly problemCount?: number;
  readonly topicFocus?: string[];
}

export interface InterviewProblemAssignment {
  readonly problemId: string;
  readonly order: number;
}

export interface SerializedInterview {
  readonly id: string;
  readonly candidateId: string;
  readonly type: string;
  readonly status: InterviewStatus;
  readonly configuration: InterviewConfiguration;
  readonly problems: readonly InterviewProblemAssignment[];
  readonly currentOrder: number | null;
  readonly recommendationId?: string;
  readonly topicId?: string;
  readonly evaluationStatus: EvaluationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
}

// Phase 9: one server-backed history row (interview + latest evaluation).
export interface SerializedInterviewSummary {
  readonly interview: SerializedInterview;
  readonly evaluation: SerializedEvaluation | null;
}

export interface SerializedInterviewMessage {
  readonly id: string;
  readonly interviewId: string;
  readonly role: "candidate" | "interviewer" | "system";
  readonly content: string;
  readonly problemId?: string;
  readonly createdAt: string;
}

export interface ProblemExample {
  readonly input: string;
  readonly output: string;
  readonly explanation?: string;
}

export interface Problem {
  readonly id: string;
  readonly title: string;
  readonly difficulty: string;
  readonly description?: string;
  readonly constraints?: readonly string[];
  readonly examples?: readonly ProblemExample[];
}

export interface ProblemStarterSet {
  readonly cpp: string;
  readonly javascript: string;
  readonly python: string;
}

export interface ProblemRunnerLink {
  readonly runnerId: string;
  readonly entry: string;
  readonly className: string;
  readonly actualRule: "pure" | "in-place" | "method-sequence";
}

export interface ProblemRunnerLinks {
  readonly python?: ProblemRunnerLink;
  readonly javascript?: ProblemRunnerLink;
  readonly cpp?: ProblemRunnerLink;
}

// 18c: dedicated content view (GET /api/problems/:id/content). Nullable
// fields mark title-only gap problems; the pane falls back to title-only.
export interface ProblemContent {
  readonly description: string | null;
  readonly constraints: readonly string[] | null;
  readonly examples: readonly ProblemExample[] | null;
  readonly starters: ProblemStarterSet | null;
  readonly runnerLinks: ProblemRunnerLinks | null;
}

export interface SerializedEvaluation {
  readonly id: string;
  readonly interviewId: string;
  readonly topicId?: string;
  readonly status: "pending" | "completed" | "failed";
  readonly source?: "llm" | "fallback";
  readonly jobId?: string;
  readonly dimensions: Record<string, { readonly score: number; readonly notes?: string }>;
  readonly hintsUsed: number;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly recommendation?: string;
  readonly overallScore?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SerializedStateSnapshot {
  readonly interview: SerializedInterview;
  readonly currentProblem: Problem | null;
  readonly responseCount: number;
  readonly evaluation: SerializedEvaluation | null;
}

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export type VoiceCredentialMode =
  | "entra-ephemeral"
  | "api-key-local-dev"
  | "unconfigured"
  | "test";

// Phase 6: GET /api/ready probe (S8a). The Lobby reads `voiceMode` to decide
// whether a session can actually be minted before enabling Start.
export interface ReadyInfo {
  readonly ok: true;
  readonly ready: boolean;
  readonly service: string;
  readonly version: string;
  readonly voiceMode: VoiceCredentialMode;
  readonly activeVoiceSessions: number;
}

export interface VoiceSessionPayload {
  readonly websocketUrl: string;
  readonly endpoint: string;
  readonly model: string;
  readonly apiVersion: string;
  readonly voice: string;
  readonly ttlSeconds: number;
  readonly expiresAt: string;
  readonly credential: { readonly tokenType: "bearer" | "api-key"; readonly token: string };
  readonly credentialMode: VoiceCredentialMode;
  readonly sessionConfig: {
    readonly audio: {
      readonly inputFormat: string;
      readonly outputFormat: string;
      readonly sampleRateHz: number;
      readonly channels: number;
    };
    readonly turnDetection: {
      readonly type: string;
      readonly threshold: number;
      readonly speechDurationMs: number;
      readonly silenceDurationMs: number;
      readonly interruptResponse: boolean;
      readonly createResponse: boolean;
    };
    readonly echoCancellation: string;
    readonly noiseReduction: string;
  };
  readonly instructions: string;
}

// POST .../tool-exec success: the backend's stored (possibly replayed) result.
export interface ToolExecSuccess {
  readonly ok: true;
  readonly callId: string;
  readonly tool: ToolName;
  readonly result: unknown;
  readonly replayed: boolean;
}
// POST .../tool-exec failure envelope. `retryable` mirrors the backend's
// error envelope: deterministic domain errors are retryable:false and are
// forwarded as function_call_output; abuse-protection 429s are
// retryable:true and the forwarder backs off with the same call_id
// (frozen section 5; audit C4-2).
export interface ToolExecFailure {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly callId: string;
  readonly tool: ToolName;
  readonly replayed: boolean;
}

export type ToolExecOutcome = ToolExecSuccess | ToolExecFailure;

// S5: problem browser (GET /api/problems).
export interface ProblemListQuery {
  readonly difficulty?: "Easy" | "Medium" | "Hard";
  readonly topic?: string;
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ProblemList {
  readonly problems: readonly Problem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// S5: deterministic auto-select (POST .../problems/select).
export interface ProblemSelectInput {
  readonly count?: number;
  readonly difficulty?: "Easy" | "Medium" | "Hard" | "Mixed";
  readonly topicFocus?: readonly string[];
}

// S5: candidate answers (POST .../responses).
export type ResponseKind = "answer" | "approach" | "code" | "question" | "note";

export interface RecordResponseInput {
  readonly kind?: ResponseKind;
  readonly content: string;
  readonly problemId?: string;
}

// S7: structured evaluation (POST .../evaluation). Dimensions use the HLD
// 5.8 set; the client renders whatever keys the backend returns so the
// 6-vs-8 bar question (design spec §8 vs HLD) needs no client change.
// S7a sandbox (HLD Phase 6): code submissions + test runs. Structural
// mirrors of the backend serializers; hidden cases arrive masked
// (pass/fail only — the backend never stores hidden actuals).
export type CodeLanguage = "javascript" | "python" | "cpp";

export interface SubmitCodeInput {
  readonly language: CodeLanguage;
  readonly code: string;
  readonly problemId?: string;
}

export interface SerializedSubmission {
  readonly id: string;
  readonly interviewId: string;
  readonly problemId?: string;
  readonly language: string;
  readonly code: string;
  readonly createdAt: string;
}

// Feature 18d: AI-only Submit verdict. Structural mirror of the backend
// serializer; computed per request, never persisted.
export interface SerializedSubmitVerdict {
  readonly correctness: string;
  readonly correctnessNotes: string;
  readonly optimality: string;
  readonly optimalityNotes: string;
  readonly breakPoints: readonly string[];
  readonly edgeCases: readonly string[];
  readonly summary: string;
}

export interface TestCaseInput {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly expected: unknown;
  readonly hidden?: boolean;
}

export interface RunCodeInput {
  readonly testCases: readonly TestCaseInput[];
  readonly timeoutMs?: number;
}

export interface SerializedTestResult {
  readonly name: string;
  readonly hidden: boolean;
  readonly passed: boolean;
  readonly actual?: unknown;
  readonly error?: string;
}

export type RunStatus = "passed" | "failed" | "timeout" | "error";

export interface SerializedRun {
  readonly id: string;
  readonly submissionId: string;
  readonly interviewId: string;
  readonly status: RunStatus;
  readonly results: readonly SerializedTestResult[];
  readonly passedCount: number;
  readonly totalCount: number;
  readonly durationMs: number;
  readonly createdAt: string;
}

// S8c accounts (HLD 7.1): self-registered local credentials. Shapes mirror
// the backend serializeSession output; the raw token is held in memory (and
// localStorage for session restore) and never logged.
export interface SerializedAuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: string;
}

export interface AuthSessionPayload {
  readonly user: SerializedAuthUser;
  readonly session: { readonly token: string; readonly expiresAt: string };
}

export interface RegisterInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

// Phase 2 profile: structural mirror of the backend serializer. The taxonomy
// keys are the wire contract; see src/profile-taxonomy.ts for labels/options.
export interface SerializedUserProfile {
  readonly userId: string;
  readonly interviewTypes: readonly string[];
  readonly role: string;
  readonly level: string;
  readonly goals?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProfileInput {
  readonly interviewTypes: readonly string[];
  readonly role: string;
  readonly level: string;
  readonly goals?: string;
}

// Phase 4 recommendation: structural mirror of the backend serializer. The
// dashboard/lobby consume this; the client never invents a recommendation.
export type RecommendationType =
  | "new_topic"
  | "continue_topic"
  | "reinforce_weakness"
  | "review_topic"
  | "advance_topic";

export type RecommendationStatus = "active" | "accepted" | "superseded";

export type RecommendationSource = "llm" | "fallback";

export interface SerializedRecommendation {
  readonly id: string;
  readonly userId: string;
  readonly curriculumId: string;
  readonly recommendationType: RecommendationType;
  readonly topicId: string;
  readonly problemId: string;
  readonly reason: string;
  readonly source: RecommendationSource;
  readonly status: RecommendationStatus;
  readonly acceptedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// Phase 3 curriculum + skill state: structural mirrors of the backend
// serializers. The curriculum is server-owned static config; the browser
// never bundles it. Skill state is user-scoped server state (Phase 5
// Dashboard reads it, Phase 13 Progress renders the full view).
export interface SerializedCurriculumModule {
  readonly id: string;
  readonly curriculumId: string;
  readonly order: number;
  readonly name: string;
  readonly objective?: string;
  readonly topicIds: readonly string[];
}

export interface SerializedCurriculumTopic {
  readonly id: string;
  readonly curriculumId: string;
  readonly moduleId: string;
  readonly order: number;
  readonly name: string;
  readonly problemIds: readonly string[];
}

export interface SerializedCurriculum {
  readonly id: string;
  readonly interviewType: string;
  readonly name: string;
  readonly version: number;
  readonly modules: readonly SerializedCurriculumModule[];
  readonly topics: readonly SerializedCurriculumTopic[];
}

export type MasteryLevel =
  | "not_started"
  | "learning"
  | "developing"
  | "proficient"
  | "mastered";

export type SkillOutcome = "success" | "partial" | "failure";

export interface SerializedUserSkillState {
  readonly userId: string;
  readonly curriculumId: string;
  readonly topicId: string;
  readonly masteryLevel: MasteryLevel;
  readonly successfulAttempts: number;
  readonly totalAttempts: number;
  readonly lastAttemptAt?: string;
  readonly lastOutcome?: SkillOutcome;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SerializedUserCurriculumProgress {
  readonly userId: string;
  readonly curriculumId: string;
  readonly currentTopicId?: string;
  readonly completedTopicIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

// GET /api/skills: skills + curriculum pointer (progress null before state).
export interface SkillSnapshot {
  readonly skills: readonly SerializedUserSkillState[];
  readonly progress: SerializedUserCurriculumProgress | null;
}
