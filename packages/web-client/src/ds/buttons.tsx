// Design-system buttons (feature 17a): forest-green primary, ghost
// secondary, terracotta danger (End interview only).

import type { MouseEvent, ReactNode } from "react";

interface ButtonProps {
  readonly children: ReactNode;
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
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

/** btn-primary — main calls to action. */
export function PrimaryButton(props: ButtonProps) {
  return <BaseButton {...props} className="btn-primary" />;
}

/** btn-danger — guarded destructive actions only. */
export function DangerButton(props: ButtonProps) {
  return <BaseButton {...props} className="btn-danger" />;
}

/** btn-ghost — secondary actions and navigation. */
export function GhostButton(props: ButtonProps) {
  return <BaseButton {...props} className="btn-ghost" />;
}
