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
}

export function ListRow({ title, subtitle, leading, trailing, href }: ListRowProps) {
  const inner = (
    <>
      {leading}
      <span className="hl-list-text">
        <span>{title}</span>
        {subtitle ? <span className="hl-list-sub">{subtitle}</span> : null}
      </span>
      {trailing}
    </>
  );
  return href ? (
    <a href={href} className="hl-list-row hl-row-link">
      {inner}
    </a>
  ) : (
    <div className="hl-list-row">{inner}</div>
  );
}
