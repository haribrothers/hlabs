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
 * Logging in with a password. `fromUser` is set on the remembered account's screen, so the code step can go back to
 * it (US-AUTH-08).
 */
export function useLogin(next: string | undefined, fromUser?: string) {
  const client = useTRPCClient();
  const router = useRouter();
  const finish = useFinishLogin();
  return useMutation({
    mutationFn: (input: { username: string; password: string; remember: boolean }) =>
      client.auth.login.mutate({ ...input, username: input.username.trim().toLowerCase(), ...withNext(next) }),
    onSuccess: async (result) => {
      if (result.status === 'totp_required') {
        await router.navigate({
          to: '/login/code',
          search: { challenge: result.challengeId, ...withNext(next), ...(fromUser ? { user: fromUser } : {}) },
        });
        return;
      }
      await finish(result.redirectTo);
    },
  });
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
