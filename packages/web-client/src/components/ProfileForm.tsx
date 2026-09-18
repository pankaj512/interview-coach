// Shared profile editor (Phase 2): used by onboarding (create) and the
// profile screen (edit). Presentational — the parent owns the backend call,
// busy/error state, and what happens on success. Taxonomy comes from the
// single client mirror in ../profile-taxonomy.ts.

import { useState } from "react";
import type { ProfileInput, SerializedUserProfile } from "../api/types.js";
import { GhostButton, PrimaryButton } from "../ds/buttons.js";
import { Field } from "../ds/primitives.js";
import {
  INTERVIEW_TYPE_OPTIONS,
  LEVEL_OPTIONS,
  ROLE_OPTIONS,
} from "../profile-taxonomy.js";

export function ProfileForm({
  initial = null,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
  className = "card auth-card onboarding-card",
  hideSubmitUntilDirty = false,
}: {
  readonly initial?: SerializedUserProfile | null;
  readonly submitLabel: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: ProfileInput) => void;
  readonly onCancel?: () => void;
  readonly className?: string;
  readonly hideSubmitUntilDirty?: boolean;
}) {
  const [interviewTypes, setInterviewTypes] = useState<readonly string[]>(
    initial?.interviewTypes ?? ["dsa"],
  );
  const [role, setRole] = useState(initial?.role ?? "");
  const [level, setLevel] = useState(initial?.level ?? "");
  const [goals, setGoals] = useState(initial?.goals ?? "");

  function toggleType(value: string) {
    setInterviewTypes((previous) =>
      previous.includes(value)
        ? previous.filter((entry) => entry !== value)
        : [...previous, value],
    );
  }

  const invalid = interviewTypes.length === 0 || role === "" || level === "";

  const baseTypes = initial?.interviewTypes ?? ["dsa"];
  const dirty =
    interviewTypes.length !== baseTypes.length ||
    interviewTypes.some((entry) => !baseTypes.includes(entry)) ||
    role !== (initial?.role ?? "") ||
    level !== (initial?.level ?? "") ||
    goals.trim() !== (initial?.goals ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid) return;
    const trimmedGoals = goals.trim();
    onSubmit({
      interviewTypes,
      role,
      level,
      ...(trimmedGoals === "" ? {} : { goals: trimmedGoals }),
    });
  }

  return (
    <form className={className} onSubmit={submit}>
      <div className="field">
        <span className="field-label">What are you preparing for?</span>
        <div className="pill-row">
          {INTERVIEW_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                interviewTypes.includes(option.value) ? "pill pill-selected" : "pill"
              }
              aria-pressed={interviewTypes.includes(option.value)}
              onClick={() => toggleType(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="" disabled>
            Select your role
          </option>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Level">
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="" disabled>
            Select your level
          </option>
          {LEVEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Goals (optional)" hint="Anything specific you want to improve?">
        <textarea
          value={goals}
          rows={3}
          maxLength={500}
          onChange={(e) => setGoals(e.target.value)}
        />
      </Field>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row actions">
        {onCancel !== undefined && <GhostButton onClick={onCancel}>Cancel</GhostButton>}
        {(!hideSubmitUntilDirty || dirty) && (
          <PrimaryButton type="submit" disabled={busy || invalid}>
            {busy ? "Saving…" : submitLabel}
          </PrimaryButton>
        )}
      </div>
    </form>
  );
}
