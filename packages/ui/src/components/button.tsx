import { iconDefaults, LoaderCircle } from '@hlabs/icons';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Common {
  /** 'primary' is the white pill: at most one per view. Default 'primary'. */
  variant?: ButtonVariant;
  /** 34 / 42 / 48px. Ignored for 'link'. Default 'md'. */
  size?: ButtonSize;
  /** Working: disabled, announced as busy, with a spinner (still when Reduce motion is on). */
  busy?: boolean;
  children: ReactNode;
}
export type ButtonProps =
  | (Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined; ref?: Ref<HTMLButtonElement> })
  | (Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; ref?: Ref<HTMLAnchorElement> });

/** A pill button. Label with a verb in sentence case ("Install", "Save changes"). */
export function Button({ variant = 'primary', size = 'md', busy = false, className, children, ...rest }: ButtonProps) {
  const classes = cn('hl-btn', `hl-btn-${variant}`, variant !== 'link' && `hl-btn-${size}`, className);
  if (rest.href !== undefined) {
    return (
      <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  const { type = 'button', disabled, ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...buttonRest}>
      {busy ? <LoaderCircle aria-hidden="true" className="hl-spin" {...iconDefaults} /> : null}
      {children}
    </button>
  );
}
