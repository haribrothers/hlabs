import { House } from '@hlabs/icons';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * "At home only" (US-SYS-47, HomeOnlyAction): a house and the words, on a control that only works at home or on the
 * tailnet while hlabs is used from the internet. Never colour alone: the house and the words say it.
 */
export function HomeOnlyPill({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn('hl-home-only', className)}>
      <House aria-hidden="true" size={12} strokeWidth={2.2} />
      {label}
    </span>
  );
}

export interface HomeOnlyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The control's own label ("Remove…"); left out for the pill alone. */
  children?: ReactNode;
  /** "At home only". */
  pill: string;
  /** 34px, as a row's small buttons (default), or 42px. */
  size?: 'sm' | 'md';
}

/**
 * A control shown, not hidden, on the public address, that explains instead of acting (HomeOnlyAction): its label
 * dimmed with the pill inside an outlined button. It opens a dialog, so it says so (`aria-haspopup`).
 */
export function HomeOnlyButton({
  children,
  pill,
  size = 'sm',
  className,
  type = 'button',
  ...rest
}: HomeOnlyButtonProps) {
  return (
    <button
      type={type}
      aria-haspopup="dialog"
      className={cn('hl-btn hl-btn-home-only', `hl-btn-${size}`, !children && 'hl-btn-home-only-bare', className)}
      {...rest}
    >
      {children}
      <HomeOnlyPill label={pill} />
    </button>
  );
}
