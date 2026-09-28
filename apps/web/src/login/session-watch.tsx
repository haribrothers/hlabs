// Signed out right away when this device's session is revoked elsewhere (US-AUTH-15): the daemon sends
// `session.revoked` on this session's own event stream.
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { loginCopy } from '../copy/login';
import { setCsrfToken } from '../lib/csrf';
import { showToast } from '../lib/toasts';
import { useTRPC } from '../lib/trpc';

/** Set while this tab logs out itself, so it doesn't also say it was logged out (US-AUTH-16). */
let loggingOut = false;
export const setLoggingOut = (value: boolean) => {
  loggingOut = value;
};

export function useSignedOutHere() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    setCsrfToken(null);
    queryClient.clear();
    await router.navigate({ to: '/login' });
    if (!loggingOut) showToast({ tone: 'warning', title: loginCopy.loggedOutHere });
  };
}

export function SessionWatch() {
  const trpc = useTRPC();
  const signedOut = useSignedOutHere();
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['session.revoked'] },
      {
        onData: (envelope) => {
          if (envelope.data.type === 'session.revoked') void signedOut();
        },
      },
    ),
  );
  return null;
}
