// Logging in from any log-in view (US-AUTH-03): on success pick up the session's CSRF token, remember the account on
// this device (US-AUTH-06) and go on; two-factor accounts go to the code step (US-AUTH-08).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { setCsrfToken } from '../lib/csrf';
import { TRPCClientError } from '@trpc/client';
import { useTRPCClient } from '../lib/trpc';
import { writeRememberedUser } from './remembered';
import { withNext } from './search';

/** After a session starts: pick up its CSRF token, remember the account on this device (US-AUTH-06), go on. */
export function useFinishLogin() {
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (redirectTo: string) => {
    const me = await client.auth.me.query();
    setCsrfToken(me.csrfToken);
    writeRememberedUser({
      username: me.username,
      displayName: me.displayName,
      role: me.role,
      avatarColor: me.avatarColor,
    });
    await queryClient.invalidateQueries();
    await router.navigate({ href: redirectTo });
  };
}

/**
 * Logging in with a password. `fromUser` is set on the remembered account's screen; from the username form the code
 * step is told so, and goes back there (US-AUTH-08). It always knows the username, for the locked page (US-AUTH-12).
 */
export function useLogin(next: string | undefined, fromUser?: string) {
  const client = useTRPCClient();
  const router = useRouter();
  const finish = useFinishLogin();
  return useMutation({
    mutationFn: (input: { username: string; password: string; remember: boolean }) =>
      client.auth.login.mutate({ ...input, username: normaliseUsername(input.username), ...withNext(next) }),
    onSuccess: async (result, input) => {
      if (result.status === 'totp_required') {
        await router.navigate({
          to: '/login/code',
          search: {
            challenge: result.challengeId,
            user: normaliseUsername(input.username),
            ...(fromUser ? {} : { from: 'username' as const }),
            ...withNext(next),
          },
        });
        return;
      }
      await finish(result.redirectTo);
    },
  });
}

const normaliseUsername = (username: string) => username.trim().toLowerCase();

/** The locked page's search: whose log-in is paused and until when, from the server's `retryAfterSeconds`. */
export function lockedSearch(err: unknown, username: string, next: string | undefined, now = Date.now()) {
  const detail = err instanceof TRPCClientError ? (err.data as { detail?: unknown } | undefined)?.detail : undefined;
  const retry = (detail as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds;
  return {
    user: normaliseUsername(username),
    ...(typeof retry === 'number' ? { until: now + retry * 1000 } : {}),
    ...withNext(next),
  };
}

export type LoginFailure = 'credentials' | 'locked' | 'unreachable' | 'other';

/** Why logging in failed (US-AUTH-04). No response at all, or a daemon still starting, is "can't reach hlabs". */
export function loginFailure(err: unknown): LoginFailure {
  if (!(err instanceof TRPCClientError)) return 'unreachable';
  const code = (err.data as { hlabsCode?: string } | undefined)?.hlabsCode;
  if (code === 'AUTH_INVALID_CREDENTIALS') return 'credentials';
  if (code === 'AUTH_LOCKED') return 'locked';
  if (!code || code === 'DAEMON_STARTING') return 'unreachable';
  return 'other';
}
