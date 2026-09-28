// Sends the browser to onboarding, or explains where to finish it, until onboarding is complete.
import { useQuery } from '@tanstack/react-query';
import { Navigate, useRouterState } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { setCsrfToken } from '../lib/csrf';
import { readSetupToken } from '../lib/setup-token';
import { isAuthLost, useTRPC } from '../lib/trpc';
import { SessionWatch } from '../login/session-watch';
import { loginRedirect } from '../login/signed-out';
import { Shell } from '../shell/shell';
import { FinishSetupElsewhere } from './finish-setup-elsewhere';
import { firstRunView } from './first-run';

/** Opening setup (a page load) resumes at the saved step; moving around inside the tab doesn't (US-ONB-03). */
let entryDecided = false;

export function FirstRunGate({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const location = useRouterState({ select: (s) => s.location });
  const { pathname } = location;
  const status = useQuery(trpc.onboarding.status.queryOptions());
  // Once someone exists there may be a session: fetch its CSRF token for mutations (07 §7.3).
  const me = useQuery({ ...trpc.auth.me.queryOptions(), enabled: status.data?.hasUsers === true, retry: false });
  useEffect(() => setCsrfToken(me.data?.csrfToken ?? null), [me.data?.csrfToken]);
  const view = firstRunView({
    entry: !entryDecided,
    pathname,
    status: status.data,
    failed: status.isError,
    hasSetupToken: readSetupToken() !== null,
    dev: import.meta.env.DEV,
    mustSetupTotp: me.data?.mustSetupTotp,
    session: !status.data?.hasUsers
      ? undefined
      : me.isSuccess
        ? 'ok'
        : me.isError && isAuthLost(me.error)
          ? 'none'
          : me.isError
            ? 'ok'
            : 'pending',
  });
  const decided = view.kind !== 'loading';
  useEffect(() => {
    if (decided) entryDecided = true;
  }, [decided]);

  switch (view.kind) {
    case 'loading':
      return <div className="hl-wall min-h-full" aria-busy="true" />;
    case 'setup':
    case 'plain':
      return children;
    case 'elsewhere':
      return <FinishSetupElsewhere />;
    case 'redirect':
      return <Navigate to={view.to} search={view.search} replace />;
    case 'app': {
      // Signed out: log in first, then come back (US-AUTH-14).
      const signedOut = status.data?.hasUsers && me.isError && isAuthLost(me.error) ? loginRedirect(location) : null;
      if (signedOut) return <Navigate {...signedOut} replace />;
      if (status.data?.hasUsers && me.isPending && !pathname.startsWith('/dev/')) {
        return <div className="hl-wall min-h-full" aria-busy="true" />;
      }
      return (
        <Shell>
          {me.isSuccess ? <SessionWatch /> : null}
          {children}
        </Shell>
      );
    }
  }
}
