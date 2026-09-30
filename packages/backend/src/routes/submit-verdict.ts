import type { FastifyInstance } from "fastify";
import {
  InterviewService,
  SubmissionService,
  asInterviewId,
  asProblemId,
  validateSubmitVerdictInput,
  validateSubmitVerdictProposal,
  type Problem,
  type RepositorySet,
  type SubmitVerdict,
  type SubmitVerdictModel,
  type SubmitVerdictProblem,
} from "@interview-coach/domain";
import { sendApiError, sendDomainError } from "../http-errors.js";
import {
  UnconfiguredSubmitVerdictModel,
} from "../submit-verdict-model.js";
import { serializeSubmitVerdict } from "../serializers.js";
import { idParamSchema, submitCodeSchema, zodMessage } from "./shared.js";

export interface SubmitVerdictRouteDeps {
  readonly interviews: InterviewService;
  readonly submissions: SubmissionService;
  readonly problems: RepositorySet["problems"];
  readonly submitVerdictModel: SubmitVerdictModel;
}

// Feature 18d: map a catalog problem onto the verdict contract. Returns
// null when the problem lacks a usable statement or constraints, so the
// model judges code alone instead of receiving a half-empty problem.
function toVerdictProblem(problem: Problem): SubmitVerdictProblem | null {
  const statement = problem.description?.trim() ?? "";
  const constraints = (problem.constraints ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (statement === "" || constraints.length === 0) return null;
  return {
    id: problem.id,
    title: problem.title,
    statement,
    constraints: constraints.join("\n"),
  };
}

export function registerSubmitVerdictRoutes(app: FastifyInstance, ctx: SubmitVerdictRouteDeps): void {
  app.post("/api/interviews/:id/submit-verdict", async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(params.error), false);
    }
    const parsed = submitCodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", zodMessage(parsed.error), false);
    }
    const id = asInterviewId(params.data.id);
    const state = await ctx.interviews.getState(id);
    if (!state.ok) return sendDomainError(reply, state.error);
    const current =
      parsed.data.problemId === undefined
        ? state.value.currentProblem
        : await ctx.problems.findById(asProblemId(parsed.data.problemId));
    const input = validateSubmitVerdictInput({
      interviewId: params.data.id,
      language: parsed.data.language,
      code: parsed.data.code,
      problem: current === null ? null : toVerdictProblem(current),
    });
    if (input === null) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid verdict input", false);
    }
    // No judge to call without LLM keys: 503 with plain copy, never the
    // raw "not configured" message and never a 502 (which means the model
    // ran and its output was unusable).
    if (ctx.submitVerdictModel instanceof UnconfiguredSubmitVerdictModel) {
      return sendApiError(
        reply,
        503,
        "VERDICT_NOT_CONFIGURED",
        "Submit verdict is unavailable right now. Try again later.",
        false,
      );
    }
    let proposal: SubmitVerdict | null;
    try {
      const judged = await ctx.submitVerdictModel.judge(input);
      if (judged.proposal === null) {
        return sendApiError(
          reply,
          502,
          "VERDICT_FAILED",
          judged.error ?? "Verdict model returned no verdict",
          true,
        );
      }
      proposal = validateSubmitVerdictProposal(judged.proposal);
    } catch (error) {
      return sendApiError(
        reply,
        502,
        "VERDICT_FAILED",
        error instanceof Error ? error.message : "Verdict model failed",
        true,
      );
    }
    if (proposal === null) {
      return sendApiError(
        reply,
        502,
        "VERDICT_FAILED",
        "Verdict model returned an invalid verdict",
        true,
      );
    }
    // Fix: Submit persists the code as a run-less submission through the
    // same service the Test path uses (shared cap, status and problem
    // guards), so the evaluation reader credits coding evidence. Still no
    // sandbox run, no verdict row. Only a judged submit persists: 400/404
    // and 502/503 failures store nothing.
    const stored = await ctx.submissions.submit(id, {
      language: parsed.data.language,
      code: parsed.data.code,
      ...(parsed.data.problemId === undefined
        ? {}
        : { problemId: parsed.data.problemId }),
    });
    if (!stored.ok) return sendDomainError(reply, stored.error);
    request.log.info(
      { interviewId: params.data.id, submissionId: stored.value.id },
      "code.verdict",
    );
    return reply.send({ ok: true, verdict: serializeSubmitVerdict(proposal) });
  });
}
