// US-SYS-12 · Manage data location and drives: the storage root and app data paths, each drive with its address,
// the apps using it and Connected or Offline; Disconnect names the apps that will stop and ejects the drive; an
// external drive that isn't plugged in says so with no Disconnect; "+ Connect a drive" opens the NetworkDrives
// dialog; "Move data…" waits for phase 9; the list follows storage.locationChanged and asks every 10 s.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LOCATIONS, renderStorage } from '../test/storage';
import { DRIVES_POLL_MS } from './storage-section';

describe('US-SYS-12', () => {
  it('shows where data lives, and each drive with its address, the apps using it and whether it is there', async () => {
    renderStorage();
    const data = await screen.findByRole('group', { name: 'Data location' });
    expect(within(data).getByText('~/hlabs')).toBeInTheDocument();
    expect(within(data).getByText('Home folders, Shared and media live here')).toBeInTheDocument();
    expect(within(data).getByText('~/hlabs/app-data')).toBeInTheDocument();
    expect(within(data).getByText('App data · Apps keep their data here')).toBeInTheDocument();
    // Moving all data ships in phase 9.
    expect(within(data).queryByRole('button', { name: 'Move data…' })).toBeNull();

    const drives = screen.getByRole('group', { name: 'Drives' });
    expect(within(drives).getByText('NAS · Media')).toBeInTheDocument();
    expect(within(drives).getByText('smb://nas.local/Media')).toBeInTheDocument();
    expect(within(drives).getByText(/connected · used by Jellyfin/)).toBeInTheDocument();
    expect(within(drives).getByText('Connected')).toBeInTheDocument();
    expect(within(drives).getByText('Travel disk')).toBeInTheDocument();
    expect(within(drives).getByText('External drive · not plugged in')).toBeInTheDocument();
    expect(within(drives).getByText('Offline')).toBeInTheDocument();
    // Only the connected network drive can be disconnected.
    expect(within(drives).getAllByRole('button', { name: 'Disconnect' })).toHaveLength(1);
  });

  it('Disconnect names the apps that will stop, then ejects the drive', async () => {
    const eject = vi.fn(() => ({ ok: true, stoppedApps: ['Jellyfin'] }));
    renderStorage({ 'storage.locations.eject': eject as never });
    const drives = await screen.findByRole('group', { name: 'Drives' });
    fireEvent.click(within(drives).getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disconnect NAS · Media?' });
    expect(dialog).toHaveTextContent('Jellyfin will stop until the drive is back. Files on the drive are not deleted.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(eject).toHaveBeenCalledWith({ locationId: 'nas' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('"+ Connect a drive" opens the NetworkDrives dialog from Files', async () => {
    renderStorage();
    fireEvent.click(await screen.findByRole('button', { name: '+ Connect a drive' }));
    expect(await screen.findByRole('dialog', { name: 'Connect a network drive' })).toBeInTheDocument();
  });

  it('asks again every 10 s, so a drive coming or going shows without a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let status = 'ok';
      const list = vi.fn(() => ({
        ...LOCATIONS,
        locations: LOCATIONS.locations.map((l) => (l.id === 'nas' ? { ...l, status } : l)),
      }));
      renderStorage({ 'storage.locations.list': list });
      const drives = await screen.findByRole('group', { name: 'Drives' });
      expect(within(drives).getByText('Connected')).toBeInTheDocument();
      status = 'unreachable';
      await vi.advanceTimersByTimeAsync(DRIVES_POLL_MS);
      await waitFor(() => expect(within(drives).getAllByText('Offline')).toHaveLength(2));
      expect(within(drives).getByText(/smb:\/\/nas.local\/Media/).parentElement).toHaveTextContent('offline');
    } finally {
      vi.useRealTimers();
    }
  });
});
