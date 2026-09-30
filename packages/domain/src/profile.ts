// @interview-coach/domain - UserProfile (learning-loop Phase 2).
//
// The profile is the starting context for recommendation + evaluation: what
// the candidate is preparing for (interview types), their role and level, and
// optional free-text goals. It is backend-owned server state (ADR-002): the
// browser reads/writes it through /api/profile, never localStorage.
//
// Taxonomy is domain configuration (roadmap locked decision 8), not scattered
// UI constants. Canonical snake_case keys are the persisted/wire contract;
// labels are presentation-only and may change without a migration. The web
// client mirrors this taxonomy in one module because it cannot import this
// package (node:crypto); keep the two in sync when the taxonomy changes.

import type { UserId } from "./ids.js";
import { domainError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";
import type { InterviewType } from "./interview.js";

// Interview types: DSA only for v1; extensible to System Design, Behavioral,
// AI/ML, ... (roadmap locked decision 13/14).
export const INTERVIEW_TYPES = ["dsa"] as const;

export function isInterviewType(value: string): value is InterviewType {
  return (INTERVIEW_TYPES as readonly string[]).includes(value);
}

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  dsa: "Data Structures & Algorithms",
};

// Candidate roles (roadmap locked decision 8).
export const PROFILE_ROLES = [
  "frontend_engineer",
  "backend_engineer",
  "full_stack_engineer",
  "mobile_engineer",
  "data_scientist",
  "ml_engineer",
  "devops_sre",
  "data_engineer",
  "software_engineer",
  "other",
] as const;

export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const PROFILE_ROLE_LABELS: Record<ProfileRole, string> = {
  frontend_engineer: "Frontend Engineer",
  backend_engineer: "Backend Engineer",
  full_stack_engineer: "Full Stack Engineer",
  mobile_engineer: "Mobile Engineer",
  data_scientist: "Data Scientist",
  ml_engineer: "ML Engineer",
  devops_sre: "DevOps/SRE",
  data_engineer: "Data Engineer",
  software_engineer: "Software Engineer",
  other: "Other",
};

export function isProfileRole(value: string): value is ProfileRole {
  return (PROFILE_ROLES as readonly string[]).includes(value);
}

// Seniority levels (roadmap locked decision 8).
export const PROFILE_LEVELS = [
  "entry",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
] as const;

export type ProfileLevel = (typeof PROFILE_LEVELS)[number];

export const PROFILE_LEVEL_LABELS: Record<ProfileLevel, string> = {
  entry: "Entry",
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
};

export function isProfileLevel(value: string): value is ProfileLevel {
  return (PROFILE_LEVELS as readonly string[]).includes(value);
}

export const MAX_GOALS_LENGTH = 500;
export const MAX_INTERVIEW_TYPES = INTERVIEW_TYPES.length;

export interface UserProfile {
  readonly userId: UserId;
  /** At least one interview type; v1 only "dsa". */
  readonly interviewTypes: readonly InterviewType[];
  readonly role: ProfileRole;
  readonly level: ProfileLevel;
  readonly goals?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Untyped input (HTTP body, script, test): the domain is the validation
// boundary, so every field arrives as a loose type and is narrowed here.
export interface ProfileInput {
  readonly interviewTypes: readonly unknown[];
  readonly role: unknown;
  readonly level: unknown;
  readonly goals?: unknown;
}

export interface CreateUserProfileInput extends ProfileInput {
  readonly userId: UserId;
  readonly now?: Date;
}

function validateInterviewTypes(
  raw: readonly unknown[],
): Result<readonly InterviewType[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return err(
      domainError("VALIDATION_ERROR", "interviewTypes must be a non-empty array"),
    );
  }
  if (raw.length > MAX_INTERVIEW_TYPES) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `interviewTypes must have at most ${MAX_INTERVIEW_TYPES} entries`,
      ),
    );
  }
  const seen = new Set<string>();
  const types: InterviewType[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !isInterviewType(entry)) {
      return err(
        domainError("VALIDATION_ERROR", `Unknown interviewType: ${String(entry)}`, {
          allowed: INTERVIEW_TYPES,
        }),
      );
    }
    if (seen.has(entry)) {
      return err(
        domainError("VALIDATION_ERROR", `Duplicate interviewType: ${entry}`),
      );
    }
    seen.add(entry);
    types.push(entry);
  }
  return ok(types);
}

function normalizeGoals(raw: unknown): Result<string | undefined> {
  if (raw === undefined || raw === null) return ok(undefined);
  if (typeof raw !== "string") {
    return err(domainError("VALIDATION_ERROR", "goals must be a string"));
  }
  const trimmed = raw.trim();
  if (trimmed === "") return ok(undefined);
  if (trimmed.length > MAX_GOALS_LENGTH) {
    return err(
      domainError(
        "VALIDATION_ERROR",
        `goals must be at most ${MAX_GOALS_LENGTH} characters`,
      ),
    );
  }
  return ok(trimmed);
}

function validateRole(raw: unknown): Result<ProfileRole> {
  if (typeof raw !== "string" || !isProfileRole(raw)) {
    return err(domainError("VALIDATION_ERROR", `Unknown role: ${String(raw)}`, {
      allowed: PROFILE_ROLES,
    }));
  }
  return ok(raw);
}

function validateLevel(raw: unknown): Result<ProfileLevel> {
  if (typeof raw !== "string" || !isProfileLevel(raw)) {
    return err(domainError("VALIDATION_ERROR", `Unknown level: ${String(raw)}`, {
      allowed: PROFILE_LEVELS,
    }));
  }
  return ok(raw);
}

export function createUserProfile(
  input: CreateUserProfileInput,
): Result<UserProfile> {
  const interviewTypes = validateInterviewTypes(input.interviewTypes);
  if (!interviewTypes.ok) return interviewTypes;
  const role = validateRole(input.role);
  if (!role.ok) return role;
  const level = validateLevel(input.level);
  if (!level.ok) return level;
  const goals = normalizeGoals(input.goals);
  if (!goals.ok) return goals;
  const now = input.now ?? new Date();
  return ok({
    userId: input.userId,
    interviewTypes: interviewTypes.value,
    role: role.value,
    level: level.value,
    ...(goals.value === undefined ? {} : { goals: goals.value }),
    createdAt: now,
    updatedAt: now,
  });
}

// Editing keeps identity + createdAt; only the editable fields move.
export function updateUserProfile(
  existing: UserProfile,
  input: ProfileInput,
  now: Date = new Date(),
): Result<UserProfile> {
  const validated = createUserProfile({
    userId: existing.userId,
    interviewTypes: input.interviewTypes,
    role: input.role,
    level: input.level,
    ...(input.goals === undefined ? {} : { goals: input.goals }),
    now,
  });
  if (!validated.ok) return validated;
  return ok({ ...validated.value, createdAt: existing.createdAt });
}
