import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Common {
  /** 'primary' is the white pill: at most one per view. Default 'primary'. */
  variant?: ButtonVariant;
  /** 34 / 42 / 48px. Ignored for 'link'. Default 'md'. */
  size?: ButtonSize;
  children: ReactNode;
}
export type ButtonProps =
  | (Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
  | (Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string });

/** A pill button. Label with a verb in sentence case ("Install", "Save changes"). */
export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonProps) {
  const classes = cn('hl-btn', `hl-btn-${variant}`, variant !== 'link' && `hl-btn-${size}`, className);
  if (rest.href !== undefined) {
    return (
      <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  const { type = 'button', ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={classes} {...buttonRest}>
      {children}
    </button>
  );
}
