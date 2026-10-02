// App settings and Logs are for admins: members get "You don't have access to this" at the same address (US-STATE-20).
import type { ReactNode } from 'react';
import { useMe } from '../lib/use-me';
import { AccessDenied } from '../shell/access-denied';

export function AdminOnly({ children }: { children: ReactNode }) {
  const me = useMe().data;
  if (!me) return null;
  if (me.role !== 'admin') {
    return (
      <section className="flex min-h-full items-center p-4">
        <AccessDenied />
      </section>
    );
  }
  return children;
}
