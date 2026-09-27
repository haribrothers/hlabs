import type { ReactNode } from 'react';

export type Status = 'running' | 'working' | 'failed' | 'stopped';

export interface StatusDotProps {
  status?: Status;
  /** Always pair the dot with a word; colour never carries the state alone. */
  children: ReactNode;
}

export function StatusDot({ status = 'running', children }: StatusDotProps) {
  return (
    <span className={`hl-status hl-status-${status}`}>
      <span className="hl-status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
