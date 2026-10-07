CREATE TABLE "interview_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"problem_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "recommendation_id" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "topic_id" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "evaluation_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_messages_interview_id_idx" ON "interview_messages" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "interviews_recommendation_id_idx" ON "interviews" USING btree ("recommendation_id");--> statement-breakpoint
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_role_check" CHECK ("role" IN ('candidate', 'interviewer', 'system'));--> statement-breakpoint
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_content_check" CHECK (char_length("content") > 0 AND char_length("content") <= 10000);--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_evaluation_status_check" CHECK ("evaluation_status" IN ('none', 'pending', 'completed', 'failed'));