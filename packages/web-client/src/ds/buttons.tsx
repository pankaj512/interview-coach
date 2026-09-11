// S6 design-system buttons (ux-spec §4: btn-primary/btn-danger/btn-ghost).
//
// Primary CTA is near-white (var(--cta-base)), NOT voice green —
// voice.solid is reserved for voice activity (Phase D principle 2).

import type { ReactNode } from "react";

interface ButtonProps {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly type?: "button" | "submit";
  readonly autoFocus?: boolean;
  readonly ariaLabel?: string;
}

function BaseButton({
  className,
  children,
  onClick,
  disabled = false,
  type = "button",
  autoFocus = false,
  ariaLabel,
}: ButtonProps & { readonly className: string }) {
  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

/** btn-primary (Default/Hover/Disabled) — near-white CTA. */
export function PrimaryButton(props: ButtonProps) {
  return <BaseButton {...props} className="btn-primary" />;
}

/** btn-danger — guarded End interview only (always opens the confirm dialog). */
export function DangerButton(props: ButtonProps) {
  return <BaseButton {...props} className="btn-danger" />;
}

/** btn-ghost — Back navigation. */
export function GhostButton(props: ButtonProps) {
  return <BaseButton {...props} className="btn-ghost" />;
}
