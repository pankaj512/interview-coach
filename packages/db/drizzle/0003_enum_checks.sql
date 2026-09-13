-- P2-5: DB-level enum guards. The domain validates these, but the store now
-- reinforces them so a stray write cannot persist a silently-invalid value.
-- Allowed sets mirror the domain unions (packages/domain/src/*.ts).

ALTER TABLE "interviews" ADD CONSTRAINT "interviews_status_check" CHECK ("status" IN ('created', 'ready', 'in_progress', 'paused', 'completing', 'completed', 'cancelled', 'failed'));--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_type_check" CHECK ("type" IN ('dsa'));--> statement-breakpoint
ALTER TABLE "interview_problems" ADD CONSTRAINT "interview_problems_state_check" CHECK ("state" IN ('assigned', 'active', 'completed', 'skipped'));--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_difficulty_check" CHECK ("difficulty" IN ('Easy', 'Medium', 'Hard'));--> statement-breakpoint
ALTER TABLE "candidate_responses" ADD CONSTRAINT "candidate_responses_kind_check" CHECK ("kind" IN ('answer', 'approach', 'code', 'question', 'note'));--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_language_check" CHECK ("language" IN ('javascript', 'python'));--> statement-breakpoint
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_status_check" CHECK ("status" IN ('passed', 'failed', 'timeout', 'error'));--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_recommendation_check" CHECK ("recommendation" IS NULL OR "recommendation" IN ('hire', 'lean_hire', 'lean_no_hire', 'no_hire'));
