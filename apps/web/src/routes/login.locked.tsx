import { createFileRoute } from '@tanstack/react-router';
import { loginCopy } from '../copy/login';
import { LoginLayout } from '../login/login-layout';
import { validateLoginSearch } from '../login/search';

// LoginLocked: how long to wait, and what the admin is told, arrive with US-AUTH-12 and US-AUTH-13.
export const Route = createFileRoute('/login/locked')({
  validateSearch: validateLoginSearch,
  component: () => (
    <LoginLayout>
      <h1 className="m-0 text-display">{loginCopy.lockedTitle}</h1>
    </LoginLayout>
  ),
});
