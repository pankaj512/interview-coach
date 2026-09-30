import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ToolService,
  TOOL_NAMES,
  asInterviewId,
  type RepositorySet,
  type ToolName,
  type ToolResult,
} from "@interview-coach/domain";
import { sendApiError, sendDomainError } from "../http-errors.js";
import {
  CallIdConflictError,
  CallIdToolMismatchError,
  IdempotencyStore,
} from "../idempotency.js";
import { BackendMetrics } from "../metrics.js";
import { errorBody, idParamSchema, zodMessage } from "./shared.js";

export interface ToolExecRouteDeps {
  readonly interviewsStore: RepositorySet["interviews"];
  readonly tools: ToolService;
  readonly toolIdempotency: IdempotencyStore<ToolResult>;
  readonly metrics: BackendMetrics;
}

const TOOL_NAMES_TUPLE = TOOL_NAMES as unknown as [
  ToolName,
  ...ToolName[],
];

const toolExecSchema = z.object({
  call_id: z.string().min(1).max(200),
  tool: z.enum(TOOL_NAMES_TUPLE),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

// F6-3: a transient quota/capacity result from a tool dispatch. Thrown (not
// returned) so the idempotency store does not cache it as a permanent result;
// the tool-exec route maps it to 429 retryable:true so the forwarder backs off.
class RateLimitedToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedToolError";
  }
}

export function registerToolExecRoutes(app: FastifyInstance, ctx: ToolExecRouteDeps): void {
  app.post(
    "/api/interviews/:id/tool-exec",
    async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = toolExecSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const interviewId = asInterviewId(params.data.id);
    const exists = await ctx.interviewsStore.findById(interviewId);
    if (exists === null) {
      return sendApiError(reply, 404, "NOT_FOUND", `Interview ${params.data.id} does not exist`, false);
    }
    const callId = parsed.data.call_id;
    const tool = parsed.data.tool as ToolName;
    const toolArgs = parsed.data.arguments as Record<string, unknown> | undefined;
    request.log.info({ interviewId: interviewId as string, callId, tool }, "tool.received");
    const startedAt = Date.now();
    let outcome;
    try {
      outcome = await ctx.toolIdempotency.execute(callId, interviewId as string, tool, async () => {
        const result = await ctx.tools.dispatch(tool, { interviewId, callId }, toolArgs);
        if (result.ok) return { ok: true as const, result: result.value, error: null };
        // Transient quota/capacity (F6-3): throw so it is not cached and the
        // route can answer 429 retryable:true.
        if (result.error.code === "RATE_LIMITED") {
          throw new RateLimitedToolError(result.error.message);
        }
        return { ok: false as const, result: null, error: result.error };
      });
    } catch (error) {
      if (error instanceof CallIdConflictError) {
        return sendDomainError(reply, error.toDomainError());
      }
      if (error instanceof CallIdToolMismatchError) {
        return sendDomainError(reply, error.toDomainError());
      }
      if (error instanceof RateLimitedToolError) {
        return sendApiError(reply, 429, "RATE_LIMITED", error.message, true);
      }
      throw error;
    }
    const elapsedMs = Date.now() - startedAt;
    request.log.info(
      { interviewId: interviewId as string, callId, tool, elapsedMs, replayed: outcome.replayed, ok: outcome.record.ok },
      "tool.executed",
    );
    const record = outcome.record;
    ctx.metrics.countTool(outcome.replayed, record.ok);
    if (record.ok) {
      return reply.send({
        ok: true,
        callId: record.callId,
        tool: record.tool,
        result: record.result,
        replayed: outcome.replayed,
      });
    }
    // record.error is non-null when ok is false (stored by execute above).
    const { status, body } = errorBody(record);
    return reply.status(status).send({
      ...body,
      callId: record.callId,
      tool: record.tool,
      replayed: outcome.replayed,
    });
  });
}
