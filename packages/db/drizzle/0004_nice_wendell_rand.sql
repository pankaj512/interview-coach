CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"interview_types" jsonb NOT NULL,
	"role" text NOT NULL,
	"level" text NOT NULL,
	"goals" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_profiles_role_idx" ON "user_profiles" USING btree ("role");--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_role_check" CHECK ("role" IN ('frontend_engineer', 'backend_engineer', 'full_stack_engineer', 'mobile_engineer', 'data_scientist', 'ml_engineer', 'devops_sre', 'data_engineer', 'software_engineer', 'other'));--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_level_check" CHECK ("level" IN ('entry', 'junior', 'mid', 'senior', 'staff', 'principal'));--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_interview_types_check" CHECK (jsonb_typeof("interview_types") = 'array' AND jsonb_array_length("interview_types") > 0);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_goals_check" CHECK ("goals" IS NULL OR char_length("goals") <= 500);