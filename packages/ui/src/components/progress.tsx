import type { ReactNode } from 'react';

export interface ProgressProps {
  /** 0–100 */
  value: number;
  /** What is happening: "Downloading Immich". */
  label?: ReactNode;
  /** How far: "1.2 of 2.4 GB". Defaults to "<value>%". */
  detail?: ReactNode;
  /** Accessible name when there is no visible label. */
  'aria-label'?: string;
}

export function Progress({ value, label, detail, ...aria }: ProgressProps) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="hl-progress">
      {label !== undefined || detail !== undefined ? (
        <div className="hl-progress-top">
          <span>{label}</span>
          <b>{detail ?? `${v}%`}</b>
        </div>
      ) : null}
      <div
        className="hl-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-label={typeof label === 'string' ? label : aria['aria-label']}
      >
        <div className="hl-progress-fill" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
