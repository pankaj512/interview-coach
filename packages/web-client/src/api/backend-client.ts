// @interview-coach/web-client — control-plane HTTP client (S4).
//
// Control plane (frozen section 2): Browser<->Fastify over HTTPS. Every
// method maps 1:1 to an S3 route; error envelopes surface as
// BackendApiError. Tool-exec is special: 4xx permanent failures are returned
// as data (ToolExecFailure — model-facing, forwarded to Voice Live), while
// transport/5xx failures throw so the forwarder can retry them.

import type {
  InterviewConfiguration,
  Problem,
  ProblemList,
  ProblemListQuery,
  ProblemSelectInput,
  RecordResponseInput,
  EvaluationInput,
  SerializedEvaluation,
  SerializedInterview,
  SerializedStateSnapshot,
  ToolArgs,
  ToolExecOutcome,
  ToolName,
  VoiceSessionPayload,
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
  return impl as FetchFn;
}

export interface CreateInterviewInput {
  readonly candidateId: string;
  readonly configuration: InterviewConfiguration;
}

export class BackendClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(baseUrl: string, fetchFn?: FetchFn) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn ?? defaultFetch();
  }

  get url(): string {
    return this.baseUrl;
  }

  async getHealth(): Promise<{ ok: true; service: string; version: string }> {
    return this.request("GET", "/api/health");
  }

  async createInterview(input: CreateInterviewInput): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      "/api/interviews",
      { candidateId: input.candidateId, configuration: input.configuration },
    );
    return body.interview;
  }

  async getInterview(id: string): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "GET",
      `/api/interviews/${encodeURIComponent(id)}`,
    );
    return body.interview;
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

  async assignProblems(id: string, problemIds: readonly string[]): Promise<SerializedInterview> {
    const body = await this.request<{ ok: true; interview: SerializedInterview }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/problems`,
      { problemIds: [...problemIds] },
    );
    return body.interview;
  }

  async getProblem(id: string): Promise<Problem> {
    const body = await this.request<{ ok: true; problem: Problem }>(
      "GET",
      `/api/problems/${encodeURIComponent(id)}`,
    );
    return body.problem;
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
          headers: { "content-type": "application/json" },
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
      // Permanent domain failure: model-facing result, never a retry.
      const record = parsed as { callId?: unknown; tool?: unknown; replayed?: unknown };
      return {
        ok: false,
        status: response.status,
        code: parsed.error.code,
        message: parsed.error.message,
        retryable: false,
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
        tool: (record.tool as ToolName | undefined) ?? "get_interview_state",
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

  async submitEvaluation(id: string, input: EvaluationInput): Promise<SerializedEvaluation> {
    const body = await this.request<{ ok: true; evaluation: SerializedEvaluation }>(
      "POST",
      `/api/interviews/${encodeURIComponent(id)}/evaluation`,
      { ...input },
    );
    return body.evaluation;
  }

  async deleteVoiceSession(interviewId: string): Promise<void> {
    await this.request<{ ok: true; active: boolean }>(
      "DELETE",
      `/api/interviews/${encodeURIComponent(interviewId)}/voice-session`,
    );
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response;
    try {
      // Content-Type only with a body: the backend rejects an empty JSON
      // body when the header is set (S3 strict parsing), so bodyless
      // POST/DELETE calls (ready/start/end/voice-session) omit it.
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
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
