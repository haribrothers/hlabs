import { createFileRoute } from '@tanstack/react-router';
import { LockedView } from '../login/locked-view';
import { validateLoginSearch } from '../login/search';

export const Route = createFileRoute('/login/locked')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateLoginSearch(search),
    ...(typeof search.user === 'string' && search.user ? { user: search.user } : {}),
    ...(typeof search.until === 'number' ? { until: search.until } : {}),
  }),
  component: function LoginLocked() {
    const { user, until, next } = Route.useSearch();
    return <LockedView user={user} until={until} next={next} />;
  },
});
