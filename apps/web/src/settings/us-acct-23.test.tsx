import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AcceptInvite } from '../login/accept-invite';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { InviteDialog, previewHref } from './invite-dialog';

const valid = {
  status: 'valid',
  inviterName: 'Hari',
  inviterAvatarColor: null,
  displayName: 'Anu',
  role: 'member',
  appCount: 1,
};

describe('US-ACCT-23', () => {
  it('"Preview what they see" opens the invite page in preview, in a new tab', async () => {
    renderScreen(() => <InviteDialog onClose={vi.fn()} />, {
      'invites.create': () => ({ inviteId: 'i1', url: 'https://hlabs.local/invite/abc', expiresAt: 0 }),
      'apps.list': () => ({ apps: [] }),
    });
    const link = await screen.findByRole('link', { name: 'Preview what they see (opens in a new tab)' });
    expect(link).toHaveAttribute('href', '/invite/abc?preview=1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(previewHref('https://hlabs.local:8443/invite/x-y_z')).toBe('/invite/x-y_z?preview=1');
  });

  it('in preview: a banner, the form disabled, nothing can be sent, and nothing about my own session', async () => {
    const { calls, container } = renderScreen(() => <AcceptInvite token="abc" preview />, {
      'invites.inspect': () => valid,
      'auth.me': fakeMe({ username: 'hari' }),
    });
    expect(await screen.findByRole('status')).toHaveTextContent("Preview. This won't use up the invite.");
    for (const field of ['Your name', 'Username', 'Password']) expect(screen.getByLabelText(field)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join hlabs' })).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(calls.some((c) => c.path === 'invites.accept')).toBe(false);
    expect(screen.queryByText(/You're logged in as/)).toBeNull();
  });

  it('an expired or revoked invite says so in preview too', async () => {
    renderScreen(() => <AcceptInvite token="abc" preview />, {
      'invites.inspect': () => ({ ...valid, status: 'revoked', role: null }),
      'auth.me': fakeMe(),
    });
    expect(await screen.findByRole('heading', { name: "This invite doesn't work anymore" })).toBeInTheDocument();
  });
});
