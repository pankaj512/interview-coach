// @interview-coach/web - profile taxonomy mirror (Phase 2).
//
// The client cannot import @interview-coach/core (it pulls node:crypto), so
// this is the single client-side source for the taxonomy. Keep it in sync with
// packages/core/src/profile.ts when the taxonomy changes. Canonical keys are
// the wire contract (persisted + sent to the backend); labels are display-only.

export interface TaxonomyOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

export const INTERVIEW_TYPE_OPTIONS: readonly TaxonomyOption[] = [
  { value: "dsa", label: "Data Structures & Algorithms" },
];

export const ROLE_OPTIONS: readonly TaxonomyOption[] = [
  { value: "frontend_engineer", label: "Frontend Engineer" },
  { value: "backend_engineer", label: "Backend Engineer" },
  { value: "full_stack_engineer", label: "Full Stack Engineer" },
  { value: "mobile_engineer", label: "Mobile Engineer" },
  { value: "data_scientist", label: "Data Scientist" },
  { value: "ml_engineer", label: "ML Engineer" },
  { value: "devops_sre", label: "DevOps/SRE" },
  { value: "data_engineer", label: "Data Engineer" },
  { value: "software_engineer", label: "Software Engineer" },
  { value: "other", label: "Other" },
];

export const LEVEL_OPTIONS: readonly TaxonomyOption[] = [
  { value: "entry", label: "Entry" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "principal", label: "Principal" },
];

function labelOf(options: readonly TaxonomyOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function interviewTypeLabel(value: string): string {
  return labelOf(INTERVIEW_TYPE_OPTIONS, value);
}

export function roleLabel(value: string): string {
  return labelOf(ROLE_OPTIONS, value);
}

export function levelLabel(value: string): string {
  return labelOf(LEVEL_OPTIONS, value);
}
