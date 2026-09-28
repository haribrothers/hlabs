import { createFileRoute, Navigate } from '@tanstack/react-router';
import { validateLoginSearch, withNext } from '../login/search';

// Which log-in screen fits this device arrives with US-AUTH-05; for now the list of accounts.
export const Route = createFileRoute('/login/')({
  validateSearch: validateLoginSearch,
  component: function LoginIndex() {
    const { next } = Route.useSearch();
    return <Navigate to="/login/users" search={withNext(next)} replace />;
  },
});
