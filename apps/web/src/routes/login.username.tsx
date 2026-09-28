import { createFileRoute } from '@tanstack/react-router';
import { validateLoginSearch } from '../login/search';
import { UsernameView } from '../login/username-view';

export const Route = createFileRoute('/login/username')({
  validateSearch: validateLoginSearch,
  component: function LoginUsername() {
    const { next, reason } = Route.useSearch();
    return <UsernameView next={next} reason={reason} />;
  },
});
