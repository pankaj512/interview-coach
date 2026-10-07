CREATE TABLE "evaluation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "topic_id" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "job_id" text;--> statement-breakpoint
ALTER TABLE "evaluation_jobs" ADD CONSTRAINT "evaluation_jobs_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluation_jobs_interview_id_idx" ON "evaluation_jobs" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "evaluation_jobs_status_idx" ON "evaluation_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "evaluation_jobs" ADD CONSTRAINT "evaluation_jobs_status_check" CHECK ("status" IN ('pending', 'running', 'completed', 'failed'));--> statement-breakpoint
ALTER TABLE "evaluation_jobs" ADD CONSTRAINT "evaluation_jobs_attempts_check" CHECK ("attempts" >= 0);--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_status_check" CHECK ("status" IN ('pending', 'completed', 'failed'));--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_source_check" CHECK ("source" IS NULL OR "source" IN ('llm', 'fallback'));