import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ProgressProps {
  /** 0–100 */
  value: number;
  /** What is happening: "Downloading Immich". */
  label?: ReactNode;
  /** How far: "1.2 of 2.4 GB". Defaults to "<value>%". */
  detail?: ReactNode;
  /** Accessible name when there is no visible label. */
  'aria-label'?: string;
  /** Sizing where it sits in a row: the default minimum width (260px) suits a card, not a row's trailing slot. */
  className?: string;
  /** 'success' for something finished (an upload that's done). Default the accent. */
  tone?: 'accent' | 'success';
}

export function Progress({ value, label, detail, className, tone = 'accent', ...aria }: ProgressProps) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className={cn('hl-progress', className)}>
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
        <div
          className={cn('hl-progress-fill', tone === 'success' && 'hl-progress-success')}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
