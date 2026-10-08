// @interview-coach/web - control-plane HTTP client (S4).
//
// Control plane (frozen section 2): Browser<->Fastify over HTTPS. Every
// method maps 1:1 to an S3 route; error envelopes surface as
// BackendApiError. Tool-exec is special: 4xx permanent failures are returned
// as data (ToolExecFailure - model-facing, forwarded to Voice Live), while
// transport/5xx failures throw so the forwarder can retry them.

import type {
  EvaluationStatus,
  InterviewConfiguration,
  InterviewStatus,
  ProblemContent,
  ProblemList,
  ProblemListQuery,
  ProblemSelectInput,
  RecordResponseInput,
  RunCodeInput,
  SerializedEvaluation,
  SerializedInterview,
  SerializedInterviewMessage,
  SerializedInterviewSummary,
  SerializedRun,
  SerializedStateSnapshot,
  SerializedSubmission,
  SerializedSubmitVerdict,
  SubmitCodeInput,
  ToolArgs,
  ToolExecOutcome,
  ToolName,
  VoiceSessionPayload,
  AuthSessionPayload,
  LoginInput,
  RegisterInput,
  SerializedUserProfile,
  ProfileInput,
  SerializedRecommendation,
  SerializedCurriculum,
  SkillSnapshot,
  ReadyInfo,
} from "./types.js";

export class BackendApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(status: number, code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export type FetchFn = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; json(): Promise<unknown> }>;

interface ApiErrorEnvelope {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record["ok"] !== false) return false;
  const error = record["error"];
  if (typeof error !== "object" || error === null) return false;
  const err = error as Record<string, unknown>;
  return (
    typeof err["code"] === "string" &&
    typeof err["message"] === "string" &&
    typeof err["retryable"] === "boolean"
  );
}

function defaultFetch(): FetchFn {
  const impl = (globalThis as { fetch?: unknown })["fetch"];
  if (typeof impl !== "function") {
    throw new Error("No fetch implementation available");
  }
  const fn = impl as FetchFn;
  // Wrap instead of returning the bare reference: the client calls
  // `this.fetchFn(...)`, and a browser's `window.fetch` rejects a non-Window
  // `this` ("'fetch' called on an object that does not implement interface
  // Window"). The arrow wrapper drops the receiver.
  return (input, init) => fn(input, init);
}

export interface CreateInterviewInput {
  readonly candidateId: string;
  readonly configuration: InterviewConfiguration;
  /** Phase 9: bind the session to the recommendation it was started from. */
  readonly recommendationId?: string;
  /** Phase 9: the targeted curriculum topic (defaults from the recommendation). */
  readonly topicId?: string;
}

// Phase 9: one transcript message sent to / received from the backend.
export interface TranscriptMessageInput {
  readonly role: "candidate" | "interviewer" | "system";
  readonly content: string;
  readonly problemId?: string;
}

export class BackendClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;
  private readonly authToken: string | undefined;

  constructor(baseUrl: string, fetchFn?: FetchFn, options?: { authToken?: string }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn ?? defaultFetch();
    const token = options?.authToken?.trim();
    this.authToken = token === undefined || token === "" ? undefined : token;
  }

  get url(): string {
    return this.baseUrl;
  }

  async getHealth(): Promise<{ ok: true; service: string; version: string }> {
    return this.request("GET", "/api/health");
  }

  // Phase 6: the Lobby gates "Begin interview" on the server's voice readiness
  // (GET /api/ready → voiceMode). Open probe; a 503 NOT_READY surfaces as a
  // retryable BackendApiError.
  async getReady(): Promise<ReadyInfo> {
    return this.request("GET", "/api/ready");
  }

  // S8c accounts (HLD 7.1): self-service register/login return the session
  // token once; logout revokes it. The active token travels on every call
  // via the constructor option (localStorage-backed auth store).
  async register(input: RegisterInput): Promise<AuthSessionPayload> {
    const body = await this.request<{ ok: true } & AuthSessionPayload>(
      "POST",
      "/api/auth/register",
      { email: input.email, displayName: input.displayName, password: input.password },
    );
    return { user: body.user, session: body.session };
  }

  async login(input: LoginInput): Promise<AuthSessionPayload> {
    const body = await this.request<{ ok: true } & AuthSessionPayload>(
      "POST",
      "/api/auth/login",
      { email: input.email, password: input.password },
    );
    return { user: body.user, session: body.session };
  }

  async logout(): Promise<void> {
    await this.request<{ ok: true }>("POST", "/api/auth/logout");
  }

  // Phase 2 profile: null means the signed-in user has not onboarded yet.
  // The backend scopes both calls to the bearer's user; a missing/invalid
  // session surfaces as a 401 BackendApiError.
  async getProfile(): Promise<SerializedUserProfile | null> {
    const body = await this.request<{
      ok: true;
      profile: SerializedUserProfile | null;
    }>("GET", "/api/profile");
    return body.profile;
  }

  async putProfile(input: ProfileInput): Promise<SerializedUserProfile> {
    const body = await this.request<{ ok: true; profile: SerializedUserProfile }>(
      "PUT",
      "/api/profile",
      {
        interviewTypes: [...input.interviewTypes],
        role: input.role,
        level: input.level,
        ...(input.goals === undefined ? {} : { goals: input.goals }),
      },
    );
    return body.profile;
  }

  // Phase 4 recommendation: current proposal (null before one exists),
  // synchronous generation (backend validates + falls back), and accept.
  async getCurrentRecommendation(): Promise<SerializedRecommendation | null> {
    const body = await this.request<{
      ok: true;
      recommendation: SerializedRecommendation | null;
    }>("GET", "/api/recommendations/current");
    return body.recommendation;
  }

  async createRecommendation(): Promise<SerializedRecommendation> {
    const body = await this.request<{
      ok: true;
      recommendation: SerializedRecommendation;
      source: string;
    }>("POST", "/api/recommendations");
    return body.recommendation;
  }

  async acceptRecommendation(id: string): Promise<SerializedRecommendation> {
    const body = await this.request<{ ok: true; recommendation: SerializedRecommendation }>(
      "POST",
      `/api/recommendations/${encodeURIComponent(id)}/accept`,
    );
    return body.recommendation;
  }

  // Settings "Reset learning state": wipe the caller's recommendations,
  // skill states, and curriculum progress. Interviews are untouched.
  async resetLearningState(): Promise<{
    recommendations: number;
    skillStates: number;
    curriculumProgress: number;
  }> {
    const body = await this.request<{
      ok: true;
      deleted: { recommendations: number; skillStates: number; curriculumProgress: number };
    }>("DELETE", "/api/learning-state");
    return body.deleted;
  }

  // Phase 3 curriculum + skills: server-owned config and per-user mastery.
  // Both are read-only views; the Dashboard (Phase 5) consumes them.
  async listCurriculum(interviewType?: string): Promise<readonly SerializedCurriculum[]> {
    const suffix =
      interviewType === undefined || interviewType === ""
        ? ""
        : `?interviewType=${encodeURIComponent(interviewType)}`;
    const body = await this.request<{ ok: true; curricula: SerializedCurriculum[] }>(
      "GET",
      `/api/curriculum${suffix}`,
    );
    return body.curricula;
  }

  async getSkills(): Promise<SkillSnapshot> {
    const body = await this.request<{ ok: true } & SkillSnapshot>("GET", "/api/skills");
    return { skills: body.skills, progress: body.progress };
  }

  async createInterview(input: CreateInterviewInput): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      "/api/interviews",
      {
        candidateId: input.candidateId,
        configuration: input.configuration,
        ...(input.recommendationId === undefined
          ? {}
          : { recommendationId: input.recommendationId }),
        ...(input.topicId === undefined ? {} : { topicId: input.topicId }),
      },
    );
    return body.interview;
  }

  // Phase 9: server-backed history (user-scoped; newest first).
  async listInterviews(limit?: number): Promise<readonly SerializedInterviewSummary[]> {
    const suffix = limit === undefined ? "" : `?limit=${limit}`;
    const body = await this.request<{ ok: true; interviews: SerializedInterviewSummary[] }>(
      "GET",
      `/api/interviews${suffix}`,
    );
    return body.interviews;
  }

  async appendTranscript(
    id: string,
    messages: readonly TranscriptMessageInput[],
  ): Promise<readonly SerializedInterviewMessage[]> {
    const body = await this.request<{ ok: true; messages: SerializedInterviewMessage[] }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/transcript`,
      { messages: [...messages] },
    );
    return body.messages;
  }

  async getTranscript(id: string): Promise<readonly SerializedInterviewMessage[]> {
    const body = await this.request<{ ok: true; messages: SerializedInterviewMessage[] }>(
      "GET",
      `/api/interviews/${encodeURIComponent(id)}/transcript`,
    );
    return body.messages;
  }

  async getState(id: string): Promise<SerializedStateSnapshot> {
    const body = await this.request<{ ok: true; state: SerializedStateSnapshot }>(
      "GET",
      `/api/interviews/${encodeURIComponent(id)}/state`,
    );
    return body.state;
  }

  async markReady(id: string): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/ready`,
    );
    return body.interview;
  }

  async startInterview(id: string): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/start`,
    );
    return body.interview;
  }

  async endInterview(id: string): Promise<{ interview: SerializedInterview; transitioned: boolean }> {
    const body = await this.request<{
      ok: true;
      interview: SerializedInterview;
      transitioned: boolean;
    }>("POST", `/api/interviews/${encodeURIComponent(id)}/end`);
    return { interview: body.interview, transitioned: body.transitioned };
  }

  // S8b: hard-erase an interview (app-only; model never calls this). Live
  // sessions must be ended/cancelled first.
  async deleteInterview(id: string): Promise<{ id: string; status: InterviewStatus }> {
    const body = await this.request<{ ok: true; deleted: { id: string; status: EvaluationStatus | InterviewStatus } }>(
      "DELETE",
      `/api/interviews/${encodeURIComponent(id)}`,
    );
    // Backend echoes the pre-delete interview status; evaluationStatus is not
    // surfaced to the client here.
    return { id: body.deleted.id, status: body.deleted.status as InterviewStatus };
  }

  // S6.1: remaining lifecycle transitions (app-only; the model never calls
  // these). Cancel/fail accept an optional reason; no body means no reason.
  async pauseInterview(id: string): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/pause`,
    );
    return body.interview;
  }

  async resumeInterview(id: string): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/resume`,
    );
    return body.interview;
  }

  async cancelInterview(id: string, reason?: string): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/cancel`,
      reason === undefined ? undefined : { reason },
    );
    return body.interview;
  }

  async assignProblems(id: string, problemIds: readonly string[]): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/problems`,
      { problemIds: [...problemIds] },
    );
    return body.interview;
  }

  async getProblemContent(id: string): Promise<ProblemContent> {
    const body = await this.request<{ ok: true; content: ProblemContent }>(
      "GET",
      `/api/problems/${encodeURIComponent(id)}/content`,
    );
    return body.content;
  }

  // Tool path (frozen section 5). Returns permanent 4xx failures as data;
  // throws BackendApiError only for transport errors, 5xx, or malformed
  // bodies so the forwarder can retry them. S5: optional `args` travel as
  // `arguments` (hint level, recorded answers); same call_id => same args.
  async toolExec(
    interviewId: string,
    callId: string,
    tool: ToolName,
    signal?: AbortSignal,
    args?: ToolArgs,
  ): Promise<ToolExecOutcome> {
    let response;
    try {
      response = await this.fetchFn(
        `${this.baseUrl}/api/interviews/${encodeURIComponent(interviewId)}/tool-exec`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(this.authToken === undefined ? {} : { authorization: `Bearer ${this.authToken}` }),
          },
          body: JSON.stringify({
            call_id: callId,
            tool,
            ...(args === undefined ? {} : { arguments: args }),
          }),
          ...(signal === undefined ? {} : { signal }),
        },
      );
    } catch (error) {
      throw new BackendApiError(0, "NETWORK_ERROR", networkMessage(error), true);
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (response.status >= 200 && response.status < 300) {
      const record = parsed as {
        ok?: unknown;
        callId?: unknown;
        tool?: unknown;
        result?: unknown;
        replayed?: unknown;
      };
      if (record.ok !== true) {
        throw new BackendApiError(response.status, "BAD_RESPONSE", "Malformed tool-exec response", true);
      }
      return {
        ok: true,
        callId: typeof record.callId === "string" ? record.callId : callId,
        tool: typeof record.tool === "string" ? (record.tool as ToolName) : tool,
        result: record.result ?? null,
        replayed: record.replayed === true,
      };
    }
    if (isErrorEnvelope(parsed)) {
      // Surface the backend's retryable flag (audit C4-2): 4xx domain errors
      // are retryable:false (model-facing), while abuse-protection 429s are
      // retryable:true so the forwarder backs off with the same call_id.
      const record = parsed as { callId?: unknown; tool?: unknown; replayed?: unknown };
      return {
        ok: false,
        status: response.status,
        code: parsed.error.code,
        message: parsed.error.message,
        retryable: parsed.error.retryable,
        callId: typeof record.callId === "string" ? record.callId : callId,
        tool: typeof record.tool === "string" ? (record.tool as ToolName) : tool,
        replayed: record.replayed === true,
      };
    }
    throw new BackendApiError(
      response.status,
      response.status >= 500 ? "SERVER_ERROR" : "BAD_RESPONSE",
      `tool-exec failed with status ${response.status}`,
      response.status >= 500 || response.status === 0,
    );
  }

  // Recovery probe for reload rehydration (frozen section 5): 404 unknown
  // call_id (safe to re-execute), 409 cross-interview (must not reuse).
  async toolResult(interviewId: string, callId: string): Promise<ToolExecOutcome | null> {
    let response;
    try {
      response = await this.fetchFn(
        `${this.baseUrl}/api/interviews/${encodeURIComponent(interviewId)}/tool-results/${encodeURIComponent(callId)}`,
      );
    } catch (error) {
      throw new BackendApiError(0, "NETWORK_ERROR", networkMessage(error), true);
    }
    if (response.status === 404) return null;
    const parsed: unknown = await response.json().catch(() => null);
    if (response.status >= 200 && response.status < 300) {
      const record = parsed as { callId?: unknown; tool?: unknown; result?: unknown };
      return {
        ok: true,
        callId: typeof record.callId === "string" ? record.callId : callId,
        tool: (record.tool as ToolName | undefined) ?? "get_current_interview",
        result: record.result ?? null,
        replayed: true,
      };
    }
    if (isErrorEnvelope(parsed)) {
      throw new BackendApiError(response.status, parsed.error.code, parsed.error.message, false);
    }
    throw new BackendApiError(response.status, "BAD_RESPONSE", "Malformed tool-results response", response.status >= 500);
  }

  async createVoiceSession(interviewId: string): Promise<VoiceSessionPayload> {
    const body = await this.request<{ ok: true; session: VoiceSessionPayload }>(
      "POST",
      `/api/interviews/${encodeURIComponent(interviewId)}/voice-session`,
    );
    return body.session;
  }

  // S5 intelligence endpoints (HLD Phase 5).
  async listProblems(query: ProblemListQuery = {}): Promise<ProblemList> {
    const params = new URLSearchParams();
    if (query.difficulty !== undefined) params.set("difficulty", query.difficulty);
    if (query.topic !== undefined && query.topic !== "") params.set("topic", query.topic);
    if (query.q !== undefined && query.q !== "") params.set("q", query.q);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.offset !== undefined) params.set("offset", String(query.offset));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request<ProblemList>("GET", `/api/problems${suffix}`);
  }

  async selectProblems(id: string, input: ProblemSelectInput = {}): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/problems/select`,
      { ...input },
    );
    return body.interview;
  }

  async recordResponse(
    id: string,
    input: RecordResponseInput,
  ): Promise<{ interview: SerializedInterview; responseCount: number }> {
    const body = await this.request<{
      ok: true;
      interview: SerializedInterview;
      responseCount: number;
    }>("POST", `/api/interviews/${encodeURIComponent(id)}/responses`, { ...input });
    return { interview: body.interview, responseCount: body.responseCount };
  }

  // Phase 10: the async evaluation result (null until the job completes).
  async getEvaluation(id: string): Promise<SerializedEvaluation | null> {
    const body = await this.request<{ ok: true; evaluation: SerializedEvaluation | null }>(
      "GET",
      `/api/interviews/${encodeURIComponent(id)}/evaluation`,
    );
    return body.evaluation;
  }

  async deleteVoiceSession(interviewId: string): Promise<void> {
    await this.request<{ ok: true; active: boolean }>(
      "DELETE",
      `/api/interviews/${encodeURIComponent(interviewId)}/voice-session`,
    );
  }

  // S7a sandbox endpoints (HLD Phase 6): submit code, list submissions,
  // execute a submission against caller-supplied cases, list/fetch runs.
  async submitCode(id: string, input: SubmitCodeInput): Promise<SerializedSubmission> {
    const body = await this.request<{ ok: true; submission: SerializedSubmission }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/submissions`,
      { ...input },
    );
    return body.submission;
  }

  // Feature 18d: AI-only Submit verdict (no sandbox run, zero persistence).
  // The request input mirrors SubmitCodeInput; the verdict shape mirrors
  // SerializedSubmitVerdict.
  async submitVerdict(id: string, input: SubmitCodeInput): Promise<SerializedSubmitVerdict> {
    const body = await this.request<{ ok: true; verdict: SerializedSubmitVerdict }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/submit-verdict`,
      { ...input },
    );
    return body.verdict;
  }

  async listSubmissions(id: string): Promise<readonly SerializedSubmission[]> {
    const body = await this.request<{ ok: true; submissions: SerializedSubmission[] }>(
      "GET",
      `/api/interviews/${encodeURIComponent(id)}/submissions`,
    );
    return body.submissions;
  }

  async runSubmission(
    id: string,
    submissionId: string,
    input: RunCodeInput,
  ): Promise<SerializedRun> {
    const body = await this.request<{ ok: true; run: SerializedRun }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/submissions/${encodeURIComponent(submissionId)}/runs`,
      { ...input, testCases: [...input.testCases] },
    );
    return body.run;
  }

  async listRuns(id: string): Promise<readonly SerializedRun[]> {
    const body = await this.request<{ ok: true; runs: SerializedRun[] }>(
      "GET",
      `/api/interviews/${encodeURIComponent(id)}/runs`,
    );
    return body.runs;
  }

  async getRun(id: string, runId: string): Promise<SerializedRun> {
    const body = await this.request<{ ok: true; run: SerializedRun }>(
      "GET",
      `/api/interviews/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`,
    );
    return body.run;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response;
    try {
      // Content-Type only with a body: the backend rejects an empty JSON
      // body when the header is set (S3 strict parsing), so bodyless
      // POST/DELETE calls (ready/start/end/voice-session) omit it. The S8a
      // bearer token rides on every call when configured (local-dev-only).
      const headers: Record<string, string> = {
        ...(this.authToken === undefined ? {} : { authorization: `Bearer ${this.authToken}` }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      };
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        ...(Object.keys(headers).length === 0 ? {} : { headers }),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new BackendApiError(0, "NETWORK_ERROR", networkMessage(error), true);
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (response.status >= 200 && response.status < 300) return parsed as T;
    if (isErrorEnvelope(parsed)) {
      throw new BackendApiError(response.status, parsed.error.code, parsed.error.message, parsed.error.retryable);
    }
    throw new BackendApiError(
      response.status,
      response.status >= 500 ? "SERVER_ERROR" : "BAD_RESPONSE",
      `Request ${method} ${path} failed with status ${response.status}`,
      response.status >= 500 || response.status === 0,
    );
  }
}

function networkMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "Request timed out";
  return error instanceof Error ? error.message : "Network request failed";
}
