// Design-system primitives (ux-spec §3/§4/§5/§8).
//
// Presentational building blocks used by the redesigned screens: Card,
// Eyebrow, SectionTitle, Pill, Segmented, RadioCard, ProgressItem, Wave,
// Dialog, StatCard, ScoreRow, Field. Pure UI — no data fetching.

import type { ReactNode } from "react";
import { GhostButton, PrimaryButton } from "./buttons.js";

export function Card({
  children,
  className = "",
  as = "section",
  role,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: "section" | "div";
  readonly role?: string;
}) {
  const Tag = as;
  return (
    <Tag className={`card ${className}`.trim()} {...(role === undefined ? {} : { role })}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children }: { readonly children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function SectionTitle({ children }: { readonly children: ReactNode }) {
  return <h3 className="section-title">{children}</h3>;
}

export function Pill({
  label,
  selected = false,
  onClick,
  disabled = false,
}: {
  readonly label: string;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={selected ? "pill pill-selected" : "pill"}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  readonly options: readonly T[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={option === value ? "seg-option seg-selected" : "seg-option"}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function RadioCard({
  title,
  subtitle,
  selected,
  onSelect,
  disabled = false,
  className = "",
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      className={`radio-card${selected ? " radio-selected" : ""}${className === "" ? "" : ` ${className}`}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="radio-dot" aria-hidden="true" />
      <span className="radio-body">
        <strong>{title}</strong>
        <span className="radio-sub">{subtitle}</span>
      </span>
    </button>
  );
}

export type ProgressState = "done" | "active" | "todo";

export function ProgressItem({ label, state }: { readonly label: string; readonly state: ProgressState }) {
  const mark = state === "done" ? "✓" : state === "active" ? "●" : "○";
  return (
    <li className={`progress-item progress-${state}`}>
      <span className="progress-mark" aria-hidden="true">
        {mark}
      </span>
      <span className="progress-label">{label}</span>
    </li>
  );
}

export function ProgressChecklist({ items }: { readonly items: readonly { label: string; state: ProgressState }[] }) {
  return (
    <ul className="progress-list">
      {items.map((item, i) => (
        <ProgressItem key={`${i}-${item.label}`} label={item.label} state={item.state} />
      ))}
    </ul>
  );
}

export function Wave({ active = false, live = false, bars = 24 }: { readonly active?: boolean; readonly live?: boolean; readonly bars?: number }) {
  const cls = active ? "wave wave-active" : live ? "wave wave-live" : "wave wave-idle";
  return (
    <div className={cls} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="wave-bar" style={{ animationDelay: `${(i % 8) * 90}ms` }} />
      ))}
    </div>
  );
}

export function Dialog({
  title,
  children,
  onClose,
  actions,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly actions: ReactNode;
}) {
  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="dialog-title">{title}</h3>
        <div className="dialog-body">{children}</div>
        <div className="row actions dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, unit }: { readonly label: string; readonly value: string; readonly unit?: string }) {
  return (
    <Card className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit !== undefined && <span className="stat-unit">{unit}</span>}
      </span>
    </Card>
  );
}

export function ScoreRow({ label, score, max = 10 }: { readonly label: string; readonly score: number; readonly max?: number }) {
  const pct = Math.round((Math.min(max, Math.max(0, score)) / max) * 100);
  return (
    <div className="score-row">
      <span className="score-row-label">{label}</span>
      <span className="score-row-track" aria-hidden="true">
        <span className="score-row-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="score-row-value">{score}</span>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint !== undefined && <span className="hint">{hint}</span>}
    </label>
  );
}

export { GhostButton, PrimaryButton };
