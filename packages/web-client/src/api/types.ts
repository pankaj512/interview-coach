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

export type ToolName =
  | "get_current_problem"
  | "get_interview_state"
  | "get_candidate_performance"
  | "end_interview"
  | "get_interview_configuration"
  | "get_problem_hint"
  | "record_candidate_answer"
  | "submit_solution"
  | "run_code";

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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
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

export interface SerializedEvaluation {
  readonly id: string;
  readonly interviewId: string;
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
export interface DimensionScoreInput {
  readonly score: number;
  readonly notes?: string;
}

export interface EvaluationInput {
  readonly dimensions?: Record<string, DimensionScoreInput>;
  readonly hintsUsed?: number;
  readonly strengths?: readonly string[];
  readonly weaknesses?: readonly string[];
  readonly recommendation?: string;
  readonly overallScore?: number;
}

// S7a sandbox (HLD Phase 6): code submissions + test runs. Structural
// mirrors of the backend serializers; hidden cases arrive masked
// (pass/fail only — the backend never stores hidden actuals).
export type CodeLanguage = "javascript" | "python";

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
