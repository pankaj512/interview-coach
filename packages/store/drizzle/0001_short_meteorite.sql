CREATE TABLE "code_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"interview_id" text NOT NULL,
	"status" text NOT NULL,
	"results" jsonb NOT NULL,
	"passed_count" integer NOT NULL,
	"total_count" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"problem_id" text,
	"language" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_runs_interview_id_idx" ON "code_runs" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "code_runs_submission_id_idx" ON "code_runs" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submissions_interview_id_idx" ON "submissions" USING btree ("interview_id");