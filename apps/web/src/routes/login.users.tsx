import { createFileRoute } from '@tanstack/react-router';
import { validateLoginSearch } from '../login/search';
import { UsersView } from '../login/users-view';

export const Route = createFileRoute('/login/users')({
  validateSearch: validateLoginSearch,
  component: function LoginUsers() {
    return <UsersView next={Route.useSearch().next} />;
  },
});
