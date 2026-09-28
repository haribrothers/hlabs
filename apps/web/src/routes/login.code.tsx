import { createFileRoute } from '@tanstack/react-router';
import { CodeView } from '../login/code-view';
import { validateLoginSearch } from '../login/search';

export const Route = createFileRoute('/login/code')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateLoginSearch(search),
    challenge: typeof search.challenge === 'string' ? search.challenge : '',
    ...(typeof search.user === 'string' && search.user ? { user: search.user } : {}),
  }),
  component: function LoginCode() {
    const { challenge, next, user } = Route.useSearch();
    return <CodeView challenge={challenge} next={next} user={user} />;
  },
});
