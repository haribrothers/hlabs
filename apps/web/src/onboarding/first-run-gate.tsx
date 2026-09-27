// Sends the browser to onboarding, or explains where to finish it, until onboarding is complete.
import { useQuery } from '@tanstack/react-query';
import { Navigate, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { readSetupToken } from '../lib/setup-token';
import { useTRPC } from '../lib/trpc';
import { Shell } from '../shell/shell';
import { FinishSetupElsewhere } from './finish-setup-elsewhere';
import { firstRunView } from './first-run';

export function FirstRunGate({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const status = useQuery(trpc.onboarding.status.queryOptions());
  const view = firstRunView({
    pathname,
    status: status.data,
    failed: status.isError,
    hasSetupToken: readSetupToken() !== null,
    dev: import.meta.env.DEV,
  });

  switch (view.kind) {
    case 'loading':
      return <div className="hl-wall min-h-full" aria-busy="true" />;
    case 'setup':
      return children;
    case 'elsewhere':
      return <FinishSetupElsewhere />;
    case 'redirect':
      return <Navigate to={view.to} replace />;
    case 'app':
      return <Shell>{children}</Shell>;
  }
}
