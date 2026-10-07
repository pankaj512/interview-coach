import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  SubmissionService,
  asInterviewId,
  asSubmissionId,
  type RepositorySet,
  type RunProblemContext,
} from "@interview-coach/core";
import { sendApiError, sendDomainError } from "../http-errors.js";
import { BackendMetrics } from "../metrics.js";
import { serializeRun } from "../serializers.js";
import { zodMessage } from "./shared.js";

export interface RunRouteDeps {
  readonly submissions: SubmissionService;
  readonly submissionsStore: RepositorySet["submissions"];
  readonly problems: RepositorySet["problems"];
  readonly metrics: BackendMetrics;
}

const sandboxTestCaseSchema = z.object({
  name: z.string().min(1).max(120),
  args: z.array(z.unknown()),
  expected: z.unknown(),
  hidden: z.boolean().optional(),
});

const runCodeSchema = z.object({
  testCases: z.array(sandboxTestCaseSchema).min(1).max(50),
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
});

export function registerRunRoutes(app: FastifyInstance, ctx: RunRouteDeps): void {
  app.post(
    "/api/interviews/:id/submissions/:subId/runs",
    async (request, reply) => {
      const params = z
        .object({
          id: z.string().min(1).max(200),
          subId: z.string().min(1).max(200),
        })
        .safeParse(request.params);
      if (!params.success) {
        return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
      }
      const parsed = runCodeSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
      }
      const id = asInterviewId(params.data.id);
      const submissionId = asSubmissionId(params.data.subId);
      const submission = await ctx.submissionsStore.findById(submissionId);
      if (submission === null || submission.interviewId !== id) {
        return sendApiError(
          reply,
          404,
          "NOT_FOUND",
          `Submission ${params.data.subId} does not exist for interview ${params.data.id}`,
          false,
        );
      }
      // F6-3: concurrency is enforced in SubmissionService (shared with the
      // model tool path). Resolve the shape-runner link for the submission
      // language when the submission names a known problem; absent problem or
      // link keeps the legacy harnesses.
      let runContext: RunProblemContext | undefined;
      if (submission.problemId !== undefined) {
        const problem = await ctx.problems.findById(submission.problemId);
        if (problem !== null) {
          const link = problem.runnerLinks?.[submission.language];
          runContext = {
            problemId: problem.id,
            ...(link === undefined ? {} : { link }),
            ...(problem.examples === undefined ? {} : { examples: problem.examples }),
          };
        }
      }
      const run = await ctx.submissions.runTests(
        submissionId,
        parsed.data.testCases.map((t) => ({
          name: t.name,
          args: t.args,
          expected: t.expected,
          ...(t.hidden === undefined ? {} : { hidden: t.hidden }),
        })),
        parsed.data.timeoutMs,
        runContext,
      );
      if (!run.ok) return sendDomainError(reply, run.error);
      request.log.info(
        {
          interviewId: params.data.id,
          submissionId: params.data.subId,
          runId: run.value.id,
          status: run.value.status,
          durationMs: run.value.durationMs,
        },
        "code.executed",
      );
      ctx.metrics.countCodeRun(run.value.status);
      return reply
        .status(201)
        .send({ ok: true, run: serializeRun(run.value) });
    },
  );
}
