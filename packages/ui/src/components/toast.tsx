import { CircleCheck, CircleX, Info, TriangleAlert, X } from '@hlabs/icons';
import type { ReactNode } from 'react';
import { useUiStrings } from '../lib/strings';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ToastProps {
  tone?: ToastTone;
  title: ReactNode;
  children?: ReactNode;
  /** At most one: "View log", "Undo". */
  action?: ReactNode;
  /** Shows a dismiss button. Danger toasts stay until dismissed. */
  onDismiss?: () => void;
  /** Playing its exit (fades up; nothing with Reduce motion). */
  leaving?: boolean;
}

// An icon for every tone, so the colour is never the only signal.
const ICONS = { neutral: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleX } as const;

/** A short notice on level-3 glass. Danger toasts are alerts; the rest are status messages. */
export function Toast({ tone = 'success', title, children, action, onDismiss, leaving = false }: ToastProps) {
  const t = useUiStrings();
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`hl-toast hl-toast-${tone} ${leaving ? 'hl-anim-toast-out' : 'hl-anim-toast-in'}`}
    >
      <span className="hl-toast-icon">
        <Icon size={22} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="hl-toast-body">
        <span className="hl-toast-title">{title}</span>
        {children ? <span className="hl-toast-text">{children}</span> : null}
        {action}
      </div>
      {onDismiss ? (
        <button type="button" className="hl-toast-close" aria-label={t.dismiss} onClick={onDismiss}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
