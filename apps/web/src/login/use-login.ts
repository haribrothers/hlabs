// Logging in from any log-in view (US-AUTH-03): on success pick up the session's CSRF token, remember the account on
// this device (US-AUTH-06) and go on; two-factor accounts go to the code step (US-AUTH-08).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { setCsrfToken } from '../lib/csrf';
import { useTRPCClient } from '../lib/trpc';
import { writeRememberedUser } from './remembered';
import { withNext } from './search';

export function useLogin(next: string | undefined) {
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: { username: string; password: string; remember: boolean }) =>
      client.auth.login.mutate({ ...input, username: input.username.trim().toLowerCase(), ...withNext(next) }),
    onSuccess: async (result) => {
      if (result.status === 'totp_required') {
        await router.navigate({ to: '/login/code', search: { challenge: result.challengeId, ...withNext(next) } });
        return;
      }
      const me = await client.auth.me.query();
      setCsrfToken(me.csrfToken);
      writeRememberedUser({
        username: me.username,
        displayName: me.displayName,
        role: me.role,
        avatarColor: me.avatarColor,
      });
      await queryClient.invalidateQueries();
      await router.navigate({ href: result.redirectTo });
    },
  });
}
