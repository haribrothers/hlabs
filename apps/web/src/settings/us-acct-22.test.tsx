import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { InviteDialog } from './invite-dialog';

const app = (id: string, name: string) => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null },
});

function renderDialog(apps = [app('jellyfin', 'Jellyfin'), app('immich', 'Immich')]) {
  return renderScreen(() => <InviteDialog onClose={vi.fn()} />, {
    'invites.create': () => ({ inviteId: 'i1', url: 'https://hlabs.local/invite/abc', expiresAt: 0 }),
    'invites.update': () => ({ ok: true }),
    'invites.revoke': () => ({ ok: true }),
    'invites.list': () => ({ invites: [] }),
    'apps.list': () => ({ apps }),
  });
}

const updates = (calls: Array<{ path: string; input: unknown }>) =>
  calls.filter((c) => c.path === 'invites.update').map((c) => c.input);

describe('US-ACCT-22', () => {
  it('Role offers Member ("Uses the apps you share") and Admin ("Can change everything"), Member chosen', async () => {
    renderDialog();
    const role = await screen.findByRole('radiogroup', { name: 'Role' });
    expect(within(role).getByRole('radio', { name: /Member\s*Uses the apps you share/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(role).getByRole('radio', { name: /Admin\s*Can change everything/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('lists every installed app by name with a Switch, all off', async () => {
    renderDialog();
    const list = await screen.findByRole('group', { name: 'Apps they can open' });
    const switches = within(list).getAllByRole('switch');
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual(['Immich', 'Jellyfin']);
    expect(switches.every((s) => s.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('each change saves on the same invite, in order', async () => {
    const { calls } = renderDialog();
    await screen.findByDisplayValue('https://hlabs.local/invite/abc');
    fireEvent.click(await screen.findByRole('switch', { name: 'Jellyfin' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Immich' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Jellyfin' }));
    await waitFor(() =>
      expect(updates(calls)).toEqual([
        { inviteId: 'i1', appIds: ['jellyfin'] },
        { inviteId: 'i1', appIds: ['jellyfin', 'immich'] },
        { inviteId: 'i1', appIds: ['immich'] },
      ]),
    );
  });

  it('choosing Admin replaces the apps with "Admins can open every app."', async () => {
    const { calls } = renderDialog();
    await screen.findByDisplayValue('https://hlabs.local/invite/abc');
    fireEvent.click(await screen.findByRole('radio', { name: /Admin/ }));
    expect(screen.getByText('Admins can open every app.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Apps they can open' })).toBeNull();
    await waitFor(() => expect(updates(calls)).toEqual([{ inviteId: 'i1', role: 'admin' }]));
  });

  it('says so when no apps are installed', async () => {
    renderDialog([]);
    expect(await screen.findByText('No apps installed yet')).toBeInTheDocument();
  });
});
