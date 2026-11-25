import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ListProps {
  label?: ReactNode;
  /** A line under the label that says what the group is for ("Make single apps reachable from the internet…"). */
  hint?: ReactNode;
  children: ReactNode;
  /** 'danger' for a "Danger zone": its label in the danger colour and an edge around the rows. */
  tone?: 'default' | 'danger';
}

/** A labelled group of rows, the way every settings page is built. */
export function List({ label, hint, children, tone = 'default' }: ListProps) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className={cn('hl-list', tone === 'danger' && 'hl-list-danger')}>
      {label ? (
        <span id={labelId} className="hl-list-label">
          {label}
        </span>
      ) : null}
      {hint ? (
        <span id={hintId} className="hl-list-hint">
          {hint}
        </span>
      ) : null}
      <div
        className="hl-list-box"
        role="group"
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={hint ? hintId : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  /** A Switch, Badge, value or chevron. */
  trailing?: ReactNode;
  /** Makes the whole row a link; don't put another control in it. */
  href?: string;
  /** Makes the whole row a button (e.g. a container opening its logs); don't put another control in it. */
  onPress?: () => void;
  /** The button's tooltip, with `onPress`. */
  hint?: string;
  /** The row's accessible name as a button or link, when its text isn't the best one ("View hlabs logs"). */
  label?: string;
  /** Full-width content under the row, such as a Progress bar and a note. */
  below?: ReactNode;
  /** Something switched off, such as a disabled person: the leading visual fades and the title turns muted. */
  dimmed?: boolean;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  href,
  onPress,
  hint,
  label,
  below,
  dimmed = false,
}: ListRowProps) {
  const inner = (
    <>
      {leading}
      <span className="hl-list-text">
        <span>{title}</span>
        {subtitle ? <span className="hl-list-sub">{subtitle}</span> : null}
      </span>
      {trailing}
      {below ? <div className="hl-list-below">{below}</div> : null}
    </>
  );
  const className = cn('hl-list-row', below && 'hl-list-row-below', dimmed && 'hl-list-row-dimmed');
  if (onPress) {
    return (
      <button
        type="button"
        title={hint}
        aria-label={label}
        onClick={onPress}
        className={`${className} hl-row-link hl-row-button`}
      >
        {inner}
      </button>
    );
  }
  return href ? (
    <a href={href} aria-label={label} className={`${className} hl-row-link`}>
      {inner}
    </a>
  ) : (
    <div className={className}>{inner}</div>
  );
}
