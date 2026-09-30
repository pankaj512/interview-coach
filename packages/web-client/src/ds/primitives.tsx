// Design-system primitives (ux-spec §3/§4/§5/§8 + v1.1 Stitch → code).
//
// Presentational building blocks used by the redesigned screens: Card,
// Eyebrow, SectionTitle, SectionHead, Badge, Pill, ChipList, Segmented,
// RadioCard, ProgressItem, ProgressTrack, CtaCard, TableShell, CoachPanel,
// VoiceRail, TimelineRow, FormCard, Wave, Dialog, StatCard, ScoreRow, Field.
// Pure UI - no data fetching. Visual language (landed v1.1 Stitch → code):
// white cards, 1px #E2E8F0 borders, 8px card radius, 4px controls,
// Space Grotesk headings + Public Sans body + JetBrains Mono telemetry.

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

// v1.1 shared primitive: section head (title + optional meta/action slot).
// Mirrors the Stitch `code.html` section headers (headline-sm + label-md meta).
export function SectionHead({
  title,
  meta,
  action,
}: {
  readonly title: string;
  readonly meta?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="section-head-v11">
      <h3 className="section-title">{title}</h3>
      {(meta !== undefined || action !== undefined) && (
        <div className="section-head-side">
          {meta !== undefined && <span className="section-head-meta">{meta}</span>}
          {action}
        </div>
      )}
    </div>
  );
}

// v1.1 shared primitive: badge/pill (square-ish status token, mono telemetry).
// `tone` follows the Stitch chip semantics: neutral | pass | review | active.
export function Badge({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "pass" | "review" | "active";
}) {
  return <span className={`badge-v11 badge-${tone}`}>{children}</span>;
}

// v1.1 shared primitive: chip list (wraps Badge/Pill rows, e.g. type/difficulty
// headers on Results, weakness tags, history filter pills).
export function ChipList({ children, label }: { readonly children: ReactNode; readonly label?: string }) {
  return (
    <div className="chip-list-v11" {...(label === undefined ? {} : { "aria-label": label })}>
      {children}
    </div>
  );
}

// v1.1 shared primitive: CTA card (recommendation / practice-next card).
// Title + optional sub + body + actions; no data wiring.
export function CtaCard({
  eyebrow,
  title,
  sub,
  children,
  actions,
  className = "",
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly sub?: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card className={`cta-card-v11${className === "" ? "" : ` ${className}`}`}>
      {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
      <h3 className="cta-title">{title}</h3>
      {sub !== undefined && <p className="cta-sub">{sub}</p>}
      {children}
      {actions !== undefined && <div className="row actions">{actions}</div>}
    </Card>
  );
}

// v1.1 shared primitive: progress track (curriculum %, score bars, trend).
export function ProgressTrack({
  percent,
  label,
}: {
  readonly percent: number;
  readonly label: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <span className="progress-fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}

// v1.1 shared primitive: table shell (history list, topic mastery).
export function TableShell({ children }: { readonly children: ReactNode }) {
  return (
    <Card className="table-card">
      <table className="data-table">{children}</table>
    </Card>
  );
}

// v1.1 shared primitive: coach panel (Guided Coaching Hint/Clarify/Feedback).
// Hidden or restricted in Realistic mode by the caller - this is pure layout.
export function CoachPanel({
  title = "Coaching",
  children,
  actions,
}: {
  readonly title?: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <Card className="coach-panel">
      <h3 className="section-title">{title}</h3>
      {children !== undefined && <p className="hint">{children}</p>}
      {actions !== undefined && <div className="coach-actions">{actions}</div>}
    </Card>
  );
}

// v1.1 shared primitive: voice rail (voice state + waveform + controls).
// Wraps the existing Wave/VoiceState/buttons so Lobby/Live share one rail.
export function VoiceRail({
  state,
  waveform,
  controls,
  caption,
}: {
  readonly state: ReactNode;
  readonly waveform: ReactNode;
  readonly controls: ReactNode;
  readonly caption?: ReactNode;
}) {
  return (
    <div className="voice-rail" role="group" aria-label="Voice controls">
      <div className="voice-rail-state">{state}</div>
      <div className="voice-rail-wave">{waveform}</div>
      <div className="voice-rail-controls">{controls}</div>
      {caption !== undefined && <p className="hint">{caption}</p>}
    </div>
  );
}

// v1.1 shared primitive: timeline row (transcript turn with timestamp + tags).
export function TimelineRow({
  time,
  role,
  children,
  tags,
}: {
  readonly time: string;
  readonly role: string;
  readonly children: ReactNode;
  readonly tags?: ReactNode;
}) {
  return (
    <li className="timeline-row">
      <span className="timeline-time">{time}</span>
      <div className="timeline-body">
        <span className="turn-role">{role}</span>
        <div className="turn-text">{children}</div>
        {tags !== undefined && <div className="timeline-tags">{tags}</div>}
      </div>
    </li>
  );
}

// v1.1 shared primitive: form card (settings sections, onboarding steps).
export function FormCard({
  title,
  sub,
  children,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly children: ReactNode;
}) {
  return (
    <Card className="form-card">
      <h3 className="section-title">{title}</h3>
      {sub !== undefined && <p className="hint">{sub}</p>}
      <div className="form-card-body">{children}</div>
    </Card>
  );
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
