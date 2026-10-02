import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> {
  /** The accessible name, also shown as the tooltip: "Restart app", "Close app". */
  label: string;
  /** A Lucide icon from @hlabs/icons, `aria-hidden`. */
  children: ReactNode;
  /** Pass to render a link (opens where `target` says). */
  href?: string;
  target?: string;
}

/** A square glass button holding one icon, for window toolbars (AppWindow). The label is its name and tooltip. */
export function IconButton({ label, children, href, target, className, ...rest }: IconButtonProps) {
  const classes = cn('hl-iconbtn', className);
  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        aria-label={label}
        title={label}
        className={classes}
      >
        {children}
      </a>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} className={classes} {...rest}>
      {children}
    </button>
  );
}
