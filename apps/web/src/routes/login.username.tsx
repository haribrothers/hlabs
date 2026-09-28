import { createFileRoute } from '@tanstack/react-router';
import { loginCopy } from '../copy/login';
import { LoginLayout } from '../login/login-layout';
import { validateLoginSearch } from '../login/search';

// LoginUsername: the form arrives with US-AUTH-02 and US-AUTH-03.
export const Route = createFileRoute('/login/username')({
  validateSearch: validateLoginSearch,
  component: () => (
    <LoginLayout>
      <h1 className="m-0 text-display">{loginCopy.usernameTitle}</h1>
    </LoginLayout>
  ),
});
