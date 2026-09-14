CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"recommendation_type" text NOT NULL,
	"topic_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendations_user_id_idx" ON "recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recommendations_user_status_idx" ON "recommendations" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_type_check" CHECK ("recommendation_type" IN ('new_topic', 'continue_topic', 'reinforce_weakness', 'review_topic', 'advance_topic'));--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_source_check" CHECK ("source" IN ('llm', 'fallback'));--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_status_check" CHECK ("status" IN ('active', 'accepted', 'superseded'));--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_reason_check" CHECK (char_length("reason") > 0 AND char_length("reason") <= 500);