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
  | "end_interview";

export interface InterviewConfiguration {
  readonly interviewType: "dsa";
  readonly difficulty?: "Easy" | "Medium" | "Mixed";
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

export interface Problem {
  readonly id: string;
  readonly title: string;
  readonly difficulty: string;
  readonly description?: string;
  readonly constraints?: readonly string[];
  readonly examples?: readonly unknown[];
}

export interface SerializedEvaluation {
  readonly id: string;
  readonly interviewId: string;
  readonly dimensions: Record<string, number>;
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

// POST .../tool-exec permanent failure: deterministic domain error. This IS a
// model-facing result (forwarded as function_call_output), never retried
// as-is (frozen section 5: never retry 4xx / retryable:false).
export interface ToolExecFailure {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly retryable: false;
  readonly callId: string;
  readonly tool: ToolName;
  readonly replayed: boolean;
}

export type ToolExecOutcome = ToolExecSuccess | ToolExecFailure;
