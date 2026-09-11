CREATE TABLE "candidate_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"problem_id" text,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"hints_used" integer NOT NULL,
	"strengths" jsonb NOT NULL,
	"weaknesses" jsonb NOT NULL,
	"recommendation" text,
	"overall_score" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_events" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_problems" (
	"interview_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"order" integer NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "interview_problems_interview_id_order_pk" PRIMARY KEY("interview_id","order")
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"current_order" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"difficulty" text NOT NULL,
	"description" text,
	"constraints" jsonb,
	"examples" jsonb,
	"expected_concepts" jsonb,
	"source_links" jsonb,
	"evaluation_criteria" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_responses" ADD CONSTRAINT "candidate_responses_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_responses" ADD CONSTRAINT "candidate_responses_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_events" ADD CONSTRAINT "interview_events_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_problems" ADD CONSTRAINT "interview_problems_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_problems" ADD CONSTRAINT "interview_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_responses_interview_id_idx" ON "candidate_responses" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "evaluations_interview_id_idx" ON "evaluations" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "interview_events_interview_id_idx" ON "interview_events" USING btree ("interview_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_problems_interview_problem_uniq" ON "interview_problems" USING btree ("interview_id","problem_id");--> statement-breakpoint
CREATE INDEX "interview_problems_interview_id_idx" ON "interview_problems" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "interviews_candidate_id_idx" ON "interviews" USING btree ("candidate_id");