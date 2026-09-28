import { createFileRoute } from '@tanstack/react-router';
import { LoginLayout } from '../login/login-layout';
import { validateLoginSearch } from '../login/search';

// Login2FA: entering the code arrives with US-AUTH-08.
export const Route = createFileRoute('/login/code')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateLoginSearch(search),
    challenge: typeof search.challenge === 'string' ? search.challenge : '',
  }),
  component: () => (
    <LoginLayout>
      <h1 className="m-0 text-display">Enter your code</h1>
    </LoginLayout>
  ),
});
