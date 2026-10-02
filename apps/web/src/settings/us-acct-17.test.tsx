import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../shell/toaster';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { SectionPage } from './section-page';

const DAY = 86_400_000;
const NOW = Date.now();
const writeText = vi.fn(async () => undefined);
beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

function renderUsers() {
  let invites = [
    {
      id: 'i1',
      role: 'member',
      displayName: null,
      createdAt: NOW - DAY,
      expiresAt: NOW + 6 * DAY,
      url: 'https://hlabs.local/invite/first',
    },
  ];
  return renderScreen(
    () => (
      <>
        <SectionPage id="users" shippedPhase={3} />
        <Toaster />
      </>
    ),
    {
      'auth.me': fakeMe(),
      'users.list': () => ({ users: [] }),
      'invites.list': () => ({ invites }),
      'invites.revoke': () => {
        invites = [];
        return { ok: true };
      },
    },
  );
}

describe('US-ACCT-17', () => {
  it('a pending invite: "Invite pending", when it was made, days left and role', async () => {
    renderUsers();
    expect(await screen.findByText('Invite pending')).toBeInTheDocument();
    expect(screen.getByText('Link created yesterday · expires in 6 days · Member')).toBeInTheDocument();
  });

  it('Copy link copies the link first made and says "Link copied"', async () => {
    renderUsers();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('https://hlabs.local/invite/first');
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('Revoke asks first, then the invite leaves the list', async () => {
    const { calls } = renderUsers();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Revoke this invite?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(screen.queryByText('Invite pending')).toBeNull());
    expect(calls.find((c) => c.path === 'invites.revoke')?.input).toEqual({ inviteId: 'i1' });
  });
});
