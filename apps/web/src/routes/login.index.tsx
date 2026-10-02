import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { LoginLayout } from '../login/login-layout';
import { chooseLoginView } from '../login/choose';
import { readRememberedUser } from '../login/remembered';
import { validateLoginSearch } from '../login/search';
import { browser } from '../lib/browser';
import { useTRPC, useTRPCClient } from '../lib/trpc';

// `/login` opens the screen that fits this device (US-AUTH-05).
export const Route = createFileRoute('/login/')({
  validateSearch: validateLoginSearch,
  component: function LoginIndex() {
    const { next } = Route.useSearch();
    const trpc = useTRPC();
    const client = useTRPCClient();
    const router = useRouter();
    const me = useQuery({ ...trpc.auth.me.queryOptions(), retry: false, staleTime: 0 });
    const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
    const settled = !me.isPending && !list.isPending;

    useEffect(() => {
      if (!settled) return;
      // Already signed in, on the way to an app that didn't see the session (it's on another name, D-105): the
      // cookie is set again for this name, and the daemon says whether the app's address is allowed.
      if (me.isSuccess && next?.startsWith('https://')) {
        void client.auth.continue.mutate({ next }).then(
          ({ redirectTo }) =>
            redirectTo.startsWith('https://')
              ? browser.assign(redirectTo)
              : router.navigate({ href: redirectTo, replace: true }),
          () => router.navigate({ href: '/', replace: true }),
        );
        return;
      }
      const where = chooseLoginView({
        signedIn: me.isSuccess,
        remembered: readRememberedUser(),
        listedUsers: list.data?.users.length ?? 0,
        next,
      });
      void ('href' in where
        ? router.navigate({ href: where.href, replace: true })
        : router.navigate({ to: where.to, search: where.search, replace: true }));
    }, [settled, me.isSuccess, list.data, next, router, client]);

    return <LoginLayout>{null}</LoginLayout>;
  },
});
