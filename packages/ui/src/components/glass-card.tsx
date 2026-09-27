import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface GlassCardProps {
  /** 1 = widget on the wallpaper, 2 = window, 3 = dialog/menu. Default 1. */
  level?: 1 | 2 | 3;
  title?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** A frosted surface at one of the three glass levels. */
export function GlassCard({ level = 1, title, className, style, children }: GlassCardProps) {
  return (
    <section
      className={cn('hl-card hl-glass', `hl-glass-${level}`, className)}
      aria-label={typeof title === 'string' ? title : undefined}
      style={style}
    >
      {title ? <div className="hl-card-title">{title}</div> : null}
      {children}
    </section>
  );
}
