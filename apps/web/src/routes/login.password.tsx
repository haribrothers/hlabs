import { createFileRoute } from '@tanstack/react-router';
import { PasswordView } from '../login/password-view';
import { validateLoginSearch } from '../login/search';

export const Route = createFileRoute('/login/password')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateLoginSearch(search),
    user: typeof search.user === 'string' ? search.user : '',
  }),
  component: function LoginPassword() {
    const { user, next } = Route.useSearch();
    return <PasswordView username={user} next={next} />;
  },
});
