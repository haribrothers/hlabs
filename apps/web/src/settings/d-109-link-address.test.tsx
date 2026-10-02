import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { InviteDialog } from './invite-dialog';
import { ResetLinkDialog } from './reset-link-dialog';

describe('D-109', () => {
  it('the invite dialog shows the tailnet link, the home one "At home", and how to add family to the tailnet', async () => {
    renderScreen(() => <InviteDialog onClose={vi.fn()} />, {
      'invites.create': () => ({
        inviteId: 'i1',
        url: 'https://hari-home.tail9.ts.net/invite/abc',
        homeUrl: 'https://hlabs.local/invite/abc',
        expiresAt: 0,
      }),
      'apps.list': () => ({ apps: [] }),
    });
    expect(await screen.findByDisplayValue('https://hari-home.tail9.ts.net/invite/abc')).toBeInTheDocument();
    expect(screen.getByText('At home')).toBeInTheDocument();
    expect(screen.getByText('https://hlabs.local/invite/abc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How to add them' })).toHaveAttribute(
      'href',
      expect.stringContaining('/help/remote-access/family/'),
    );
  });

  it('the reset dialog shows the home link too', async () => {
    renderScreen(() => <ResetLinkDialog userId="u2" name="Anu" onClose={vi.fn()} />, {
      'users.resetPasswordLink': () => ({
        url: 'https://hari-home.tail9.ts.net/reset/t',
        homeUrl: 'https://hlabs.local/reset/t',
        expiresAt: 0,
      }),
    });
    expect(await screen.findByDisplayValue('https://hari-home.tail9.ts.net/reset/t')).toBeInTheDocument();
    expect(screen.getByText('https://hlabs.local/reset/t')).toBeInTheDocument();
  });
});
