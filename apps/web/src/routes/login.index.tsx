import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { LoginLayout } from '../login/login-layout';
import { chooseLoginView } from '../login/choose';
import { readRememberedUser } from '../login/remembered';
import { validateLoginSearch } from '../login/search';
import { useTRPC } from '../lib/trpc';

// `/login` opens the screen that fits this device (US-AUTH-05).
export const Route = createFileRoute('/login/')({
  validateSearch: validateLoginSearch,
  component: function LoginIndex() {
    const { next } = Route.useSearch();
    const trpc = useTRPC();
    const router = useRouter();
    const me = useQuery({ ...trpc.auth.me.queryOptions(), retry: false, staleTime: 0 });
    const list = useQuery({ ...trpc.auth.listLoginUsers.queryOptions(), retry: false });
    const settled = !me.isPending && !list.isPending;

    useEffect(() => {
      if (!settled) return;
      const where = chooseLoginView({
        signedIn: me.isSuccess,
        remembered: readRememberedUser(),
        listedUsers: list.data?.users.length ?? 0,
        next,
      });
      void ('href' in where
        ? router.navigate({ href: where.href, replace: true })
        : router.navigate({ to: where.to, search: where.search, replace: true }));
    }, [settled, me.isSuccess, list.data, next, router]);

    return <LoginLayout>{null}</LoginLayout>;
  },
});
