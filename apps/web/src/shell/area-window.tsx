// A placeholder window for an area until its phase ships (level-2 glass, title-1 heading).
import { GlassCard } from '@hlabs/ui';
import type { ReactNode } from 'react';
import { shellCopy } from '../copy/shell';

export function AreaWindow({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <GlassCard level={2} className="mx-auto w-full max-w-window p-7">
      <h1 className="m-0 text-title-1">{title}</h1>
      <p className="m-0 text-body text-ink-muted">{shellCopy.areaEmpty}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </GlassCard>
  );
}
