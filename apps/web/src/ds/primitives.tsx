// Design-system primitives.
//
// Owns: presentational building blocks for the screens (cards, badges,
// voice rail, dialogs, fields). Pure UI, no data fetching.
//
// History: ux-spec, Stitch v1.1; see docs/SESSION_HANDOFF.md.

import type { ReactNode } from "react";

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
