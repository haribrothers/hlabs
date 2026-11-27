// US-STORE-16 · Updates found and applied in the background, as Updates shows them: an update asking for new access says
// "Needs your approval: asks for new access" and Review lists only what's new; an update without its backup says "Not
// backed up: no backup destination"; updates found by a sync appear without a reload.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { icon, oneEvent, updatesData, updatesPage } from '../test/updates';

describe('US-STORE-16', () => {
  it('"Needs your approval: asks for new access"; Review lists only the new access', async () => {
    updatesPage({
      'store.listUpdates': () =>
        updatesData({
          pending: [
            {
              appId: 'syncthing',
              name: 'Syncthing',
              icon,
              state: 'running',
              fromVersion: '1.27',
              toVersion: '1.28',
              releaseNotes: null,
              releasedAt: Date.now(),
              newAccess: {
                folders: [{ key: 'music', label: 'Music', mode: 'ro' }],
                ports: [{ label: 'Sync', host: 22000, protocol: 'udp' }],
                permissions: { network: 'internet', gpu: false, dockerSocket: false, devices: [], capabilities: [] },
              },
            },
          ],
        }),
    });
    expect(await screen.findByText('Needs your approval: asks for new access')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review what Syncthing asks for' }));
    const dialog = await screen.findByRole('dialog', { name: 'Syncthing 1.28 asks for new access' });
    expect(within(dialog).getByText('Music · read only')).toBeInTheDocument();
    expect(within(dialog).getByText('Sync · 22000/UDP')).toBeInTheDocument();
    expect(within(dialog).getByText('The internet')).toBeInTheDocument();
    expect(within(dialog).queryByText('The graphics card (GPU)')).toBeNull();
  });

  it('an update made without its backup says so', async () => {
    updatesPage({
      'store.listUpdates': () =>
        updatesData({
          recent: [
            {
              appId: 'jellyfin',
              name: 'Jellyfin',
              icon,
              version: '10.10.3',
              at: Date.now() - 86_400_000 - 60_000,
              automatic: true,
              notBackedUp: true,
            },
          ],
        }),
    });
    const recent = await screen.findByRole('list', { name: 'Recently updated' });
    expect(
      within(recent).getByText('Updated yesterday · automatically · Not backed up: no backup destination'),
    ).toBeInTheDocument();
  });

  it('updates found by a store sync appear without a reload', async () => {
    let found = false;
    const ev = oneEvent();
    updatesPage({
      'store.listUpdates': () => (found ? updatesData() : updatesData({ pending: [] })),
      'events.stream': ev.handler,
    });
    await screen.findByText('All apps are up to date');
    found = true;
    await ev.send('app.updatesAvailable', { apps: [{ appId: 'immich', name: 'Immich', toVersion: '1.1' }] });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update all (2)' })).toBeInTheDocument());
  });
});
