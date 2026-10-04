import { createFileRoute } from '@tanstack/react-router';
import { ForgotView, type ForgotFrom } from '../login/forgot-view';
import { validateLoginSearch } from '../login/search';

const FROM: readonly ForgotFrom[] = ['username', 'password', 'locked'];

export const Route = createFileRoute('/login/forgot')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateLoginSearch(search),
    ...(typeof search.user === 'string' && search.user ? { user: search.user } : {}),
    ...(FROM.includes(search.from as ForgotFrom) ? { from: search.from as ForgotFrom } : {}),
  }),
  component: function LoginForgot() {
    const { user, next, from } = Route.useSearch();
    return <ForgotView user={user} next={next} from={from} />;
  },
});
