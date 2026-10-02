import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from '../shell/toaster';
import { renderScreen } from '../test/render';
import { AppsAccessDialog } from './apps-access-dialog';

const app = (id: string, name: string, ownLogin = false) => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null },
});
const anu = {
  id: 'u2',
  username: 'anu',
  displayName: 'Anu',
  role: 'member',
  avatarColor: null,
  appIds: ['jellyfin'],
  canSeeShared: false,
  canSeeUsage: false,
};

function open(apps = [app('jellyfin', 'Jellyfin'), app('vaultwarden', 'Vaultwarden', true)]) {
  const onClose = vi.fn();
  const r = renderScreen(
    () => (
      <>
        <AppsAccessDialog userId="u2" onClose={onClose} />
        <Toaster />
      </>
    ),
    {
      'users.get': () => anu,
      'apps.list': () => ({ apps }),
      'users.setAppAccess': () => ({ ok: true }),
      'users.list': () => ({ users: [] }),
    },
  );
  return { ...r, onClose };
}

describe('US-ACCT-24', () => {
  it('"What Anu can open": every installed app with a switch showing their access', async () => {
    open();
    const dialog = await screen.findByRole('dialog', { name: /What Anu can open/ });
    expect(within(dialog).getByText("Apps not shared don't appear on their Home screen")).toBeInTheDocument();
    expect(await within(dialog).findByRole('switch', { name: 'Jellyfin' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('switch', { name: 'Vaultwarden' })).toHaveAttribute('aria-checked', 'false');
  });

  it('apps with their own login say "Uses its own login too"', async () => {
    open();
    expect(await screen.findByText('Uses its own login too')).toBeInTheDocument();
    expect(screen.getAllByText('Uses its own login too')).toHaveLength(1);
  });

  it('Save sends the new access, says "Saved" and closes', async () => {
    const { calls, onClose } = open();
    fireEvent.click(await screen.findByRole('switch', { name: 'Vaultwarden' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Jellyfin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.path === 'users.setAppAccess')?.input).toEqual({
      userId: 'u2',
      appIds: ['vaultwarden'],
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('Cancel or Escape saves nothing', async () => {
    const { calls, onClose } = open();
    fireEvent.click(await screen.findByRole('switch', { name: 'Vaultwarden' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(calls.some((c) => c.path === 'users.setAppAccess')).toBe(false);
  });

  it('with no apps installed: "No apps installed yet" and a way to the App Store', async () => {
    open([]);
    expect(await screen.findByText(/No apps installed yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the App Store' })).toHaveAttribute('href', '/store');
  });
});
