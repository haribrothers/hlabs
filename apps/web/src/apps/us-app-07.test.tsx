// US-APP-07 · Storage, resources and version.
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppSettings } from './app-settings';

const never = () => new Promise(() => {});

function open(over: Partial<Parameters<typeof appDetail>[0]> = {}, get?: () => unknown) {
  const app = appDetail({
    id: 'vaultwarden',
    name: 'Vaultwarden',
    state: 'running',
    dataFolder: '~/hlabs/app-data/vaultwarden',
    disk: { dataBytes: 160_000_000, imageBytes: 50_000_000 },
    version: '1.32.0',
    latestVersion: null,
    ...over,
  });
  return renderScreen(
    () => <AppSettings appId="vaultwarden" />,
    { 'apps.get': get ?? (() => app), 'events.stream': never, 'auth.me': fakeMe({ role: 'admin' }) },
    { path: '/apps/vaultwarden/settings' },
  );
}

describe('US-APP-07', () => {
  it('Storage and resources shows the data folder and, while running, its disk use (data plus images)', async () => {
    open();
    const storage = await screen.findByRole('group', { name: 'Storage and resources' });
    expect(within(storage).getByText('Data folder')).toBeInTheDocument();
    expect(within(storage).getByText('~/hlabs/app-data/vaultwarden')).toBeInTheDocument();
    expect(within(storage).getByText('Disk 210 MB')).toBeInTheDocument();
    // Live CPU and memory wait for usage monitoring (phase 4), "Move…" for moving app data (phase 8).
    expect(within(storage).queryByText(/CPU/)).toBeNull();
    expect(within(storage).queryByRole('button', { name: /Move/ })).toBeNull();
  });

  it('a stopped app shows "Stopped · Disk 210 MB"', async () => {
    open({ state: 'stopped' });
    expect(await screen.findByText('Stopped · Disk 210 MB')).toBeInTheDocument();
  });

  it('while the first count is going it says so, and asks again until it has it', async () => {
    let calls = 0;
    const counting = appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running', disk: null });
    open({}, () => (++calls === 1 ? counting : { ...counting, disk: { dataBytes: 1_000_000, imageBytes: 0 } }));
    expect(await screen.findByText('Counting disk use…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Disk 1 MB')).toBeInTheDocument(), { timeout: 5_000 });
  });

  it('the footer says the version is up to date, or which one the store has', async () => {
    open();
    expect(await screen.findByText('Version 1.32.0 · up to date')).toBeInTheDocument();
  });

  it('a newer version in the store shows "<version> available"', async () => {
    open({ latestVersion: '1.33.0' });
    expect(await screen.findByText('Version 1.32.0 · 1.33.0 available')).toBeInTheDocument();
  });
});
