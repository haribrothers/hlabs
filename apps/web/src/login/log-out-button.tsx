// Log out (US-AUTH-16): ends this device's session; other devices stay signed in. Even when hlabs can't be reached,
// this tab forgets what it knew and goes to log in.
import { Button } from '@hlabs/ui';
import { useMutation } from '@tanstack/react-query';
import { accountCopy } from '../copy/account';
import { useTRPCClient } from '../lib/trpc';
import { setLoggingOut, useSignedOutHere } from './session-watch';

export function LogOutButton() {
  const client = useTRPCClient();
  const signedOut = useSignedOutHere();
  const logout = useMutation({
    mutationFn: async () => {
      setLoggingOut(true);
      await client.auth.logout.mutate();
    },
    onSettled: async () => {
      await signedOut();
      setLoggingOut(false);
    },
  });
  return (
    <Button variant="secondary" busy={logout.isPending} onClick={() => logout.mutate()}>
      {accountCopy.logOut}
    </Button>
  );
}
