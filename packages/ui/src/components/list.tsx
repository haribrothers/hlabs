import { useId, type ReactNode } from 'react';

export interface ListProps {
  label?: ReactNode;
  children: ReactNode;
}

/** A labelled group of rows, the way every settings page is built. */
export function List({ label, children }: ListProps) {
  const labelId = useId();
  return (
    <div className="hl-list">
      {label ? (
        <span id={labelId} className="hl-list-label">
          {label}
        </span>
      ) : null}
      <div className="hl-list-box" role="group" aria-labelledby={label ? labelId : undefined}>
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
  /** Full-width content under the row, such as a Progress bar and a note. */
  below?: ReactNode;
}

export function ListRow({ title, subtitle, leading, trailing, href, below }: ListRowProps) {
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
  const className = below ? 'hl-list-row hl-list-row-below' : 'hl-list-row';
  return href ? (
    <a href={href} className={`${className} hl-row-link`}>
      {inner}
    </a>
  ) : (
    <div className={className}>{inner}</div>
  );
}
