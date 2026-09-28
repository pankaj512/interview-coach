-- Fix: widen submissions.language CHECK to the domain CodeLanguage union.
-- C++ support landed in code (items 16/18a.3) while 0003 still allowed only
-- javascript/python, so every C++ submission insert violated this CHECK and
-- surfaced as a 500. Allowed sets mirror the domain unions
-- (packages/domain/src/*.ts).
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_language_check";--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_language_check" CHECK ("language" IN ('javascript', 'python', 'cpp'));--> statement-breakpoint
