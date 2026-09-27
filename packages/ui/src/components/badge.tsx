import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface BadgeProps {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
  children: ReactNode;
  className?: string;
}

/** A one- or two-word pill: "Installed", "Update available", "Admin". */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return <span className={cn('hl-badge', tone !== 'neutral' && `hl-badge-${tone}`, className)}>{children}</span>;
}
