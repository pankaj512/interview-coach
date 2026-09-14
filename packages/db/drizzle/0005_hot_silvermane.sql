CREATE TABLE "curricula" (
	"id" text PRIMARY KEY NOT NULL,
	"interview_type" text NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"objective" text
);
--> statement-breakpoint
CREATE TABLE "curriculum_topic_problems" (
	"topic_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "curriculum_topic_problems_topic_id_problem_id_pk" PRIMARY KEY("topic_id","problem_id")
);
--> statement-breakpoint
CREATE TABLE "curriculum_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"module_id" text NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_curriculum_progress" (
	"user_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"current_topic_id" text,
	"completed_topic_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_curriculum_progress_user_id_curriculum_id_pk" PRIMARY KEY("user_id","curriculum_id")
);
--> statement-breakpoint
CREATE TABLE "user_skill_states" (
	"user_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"mastery_level" text NOT NULL,
	"successful_attempts" integer NOT NULL,
	"total_attempts" integer NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_outcome" text,
	"strengths" jsonb NOT NULL,
	"weaknesses" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_skill_states_user_id_curriculum_id_topic_id_pk" PRIMARY KEY("user_id","curriculum_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "topic_id" text;--> statement-breakpoint
ALTER TABLE "curriculum_modules" ADD CONSTRAINT "curriculum_modules_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_topic_problems" ADD CONSTRAINT "curriculum_topic_problems_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_topic_problems" ADD CONSTRAINT "curriculum_topic_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_module_id_curriculum_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."curriculum_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_curriculum_progress" ADD CONSTRAINT "user_curriculum_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_states" ADD CONSTRAINT "user_skill_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curriculum_modules_curriculum_id_idx" ON "curriculum_modules" USING btree ("curriculum_id");--> statement-breakpoint
CREATE INDEX "curriculum_topic_problems_topic_id_idx" ON "curriculum_topic_problems" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "curriculum_topics_curriculum_id_idx" ON "curriculum_topics" USING btree ("curriculum_id");--> statement-breakpoint
CREATE INDEX "curriculum_topics_module_id_idx" ON "curriculum_topics" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "user_skill_states_user_id_idx" ON "user_skill_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "problems_topic_id_idx" ON "problems" USING btree ("topic_id");--> statement-breakpoint
ALTER TABLE "user_skill_states" ADD CONSTRAINT "user_skill_states_mastery_level_check" CHECK ("mastery_level" IN ('not_started', 'learning', 'developing', 'proficient', 'mastered'));--> statement-breakpoint
ALTER TABLE "user_skill_states" ADD CONSTRAINT "user_skill_states_last_outcome_check" CHECK ("last_outcome" IS NULL OR "last_outcome" IN ('success', 'partial', 'failure'));--> statement-breakpoint
ALTER TABLE "user_skill_states" ADD CONSTRAINT "user_skill_states_attempts_check" CHECK ("successful_attempts" >= 0 AND "total_attempts" >= 0 AND "successful_attempts" <= "total_attempts");--> statement-breakpoint
ALTER TABLE "user_skill_states" ADD CONSTRAINT "user_skill_states_notes_check" CHECK (jsonb_typeof("strengths") = 'array' AND jsonb_typeof("weaknesses") = 'array');--> statement-breakpoint
ALTER TABLE "user_curriculum_progress" ADD CONSTRAINT "user_curriculum_progress_completed_check" CHECK (jsonb_typeof("completed_topic_ids") = 'array');