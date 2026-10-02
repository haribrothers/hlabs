// US-AUTH-19 · See a "no access" page for apps not shared with me: the page /auth/verify answers with.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppPage, type NoAccessData } from './app-pages';

const data: NoAccessData = {
  kind: 'noAccess',
  homeUrl: 'https://hlabs.local/',
  appName: 'Immich',
  adminName: 'Hari',
  username: 'anu',
  displayName: 'Anu',
  avatarColor: 'mint',
  accent: 'mint',
};

describe('US-AUTH-19 · "no access" page', () => {
  it('names the app and the admin to ask, and links Home', () => {
    render(<AppPage data={data} />);
    expect(screen.getByRole('heading', { level: 1, name: "You don't have access to this" })).toBeInTheDocument();
    expect(screen.getByText('Immich hasn’t been shared with you. Ask Hari to share it with you.')).toBeInTheDocument();
    expect(screen.getByText('Signed in as @anu')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', 'https://hlabs.local/');
    expect(document.title).toBe('No access · hlabs');
    expect(document.documentElement.dataset.accent).toBe('mint');
  });

  it('asks “an admin” when there is no admin to name', () => {
    render(<AppPage data={{ ...data, adminName: null }} />);
    expect(
      screen.getByText('Immich hasn’t been shared with you. Ask an admin to share it with you.'),
    ).toBeInTheDocument();
  });
});
