import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { lacksPermissions, StorageStep } from './storage-step';

const check = () => ({ disk: { freeBytes: 142e9, path: '/Users/hari/hlabs', level: 'ok' } });
const T5 = { path: '/Volumes/Samsung_T5', name: 'Samsung_T5', freeBytes: 223e9, fsType: 'exfat', writable: true };
const WD = { path: '/Volumes/Backup', name: 'Backup', freeBytes: 1.8e12, fsType: 'apfs', writable: true };

function chooseExternal() {
  fireEvent.click(screen.getByRole('radio', { name: /External drive/ }));
}

describe('US-ONB-15', () => {
  it('warns about drives formatted FAT32 or exFAT', () => {
    expect(lacksPermissions('exfat')).toBe(true);
    expect(lacksPermissions('fat32')).toBe(true);
    expect(lacksPermissions('apfs')).toBe(false);
  });

  it('lists connected drives with name, free space and format', async () => {
    renderScreen(StorageStep, { 'onboarding.checkSystem': check, 'storage.listDrives': () => ({ drives: [T5, WD] }) });
    await screen.findByRole('radio', { name: /External drive/ });
    chooseExternal();
    const list = await screen.findByRole('radiogroup', { name: 'Connected drives' });
    expect(within(list).getByRole('radio', { name: /Samsung_T5/ })).toHaveTextContent('223 GB free · exFAT');
    expect(within(list).getByRole('radio', { name: /Backup/ })).toHaveTextContent('1.8 TB free · APFS');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('says to connect a drive when there is none', async () => {
    renderScreen(StorageStep, { 'onboarding.checkSystem': check, 'storage.listDrives': () => ({ drives: [] }) });
    await screen.findByRole('radio', { name: /External drive/ });
    chooseExternal();
    expect(await screen.findByText('Connect a drive to see it here.')).toBeInTheDocument();
  });

  it('an exFAT drive shows the permissions warning; Continue makes it the root and finishes', async () => {
    const setStorage = vi.fn(() => ({ ok: true }));
    const { router } = renderScreen(StorageStep, {
      'onboarding.checkSystem': check,
      'storage.listDrives': () => ({ drives: [T5] }),
      'onboarding.setStorage': setStorage,
      'onboarding.status': () => ({ completed: false, step: 'done', hasUsers: true }),
      'onboarding.complete': () => ({ redirectTo: '/' }),
    });
    await screen.findByRole('radio', { name: /External drive/ });
    chooseExternal();
    fireEvent.click(await screen.findByRole('radio', { name: /Samsung_T5/ }));
    expect(
      screen.getByText("This drive's format doesn't support file permissions. Some apps may not work."),
    ).toBeInTheDocument();
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeEnabled();
    fireEvent.click(cont);
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/done'));
    expect(setStorage).toHaveBeenCalledWith({ kind: 'external', path: '/Volumes/Samsung_T5' });
  });

  it('a drive ejected before Continue is unselected with an error', async () => {
    let drives = [T5];
    renderScreen(StorageStep, { 'onboarding.checkSystem': check, 'storage.listDrives': () => ({ drives }) });
    await screen.findByRole('radio', { name: /External drive/ });
    chooseExternal();
    fireEvent.click(await screen.findByRole('radio', { name: /Samsung_T5/ }));
    drives = [];
    // The list refreshes every 3 s.
    expect(
      await screen.findByText(
        'That drive was disconnected. Connect it again, or choose another.',
        {},
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('a drive gone by the time Continue is pressed is unselected with an error', async () => {
    renderScreen(StorageStep, {
      'onboarding.checkSystem': check,
      'storage.listDrives': () => ({ drives: [T5] }),
      'onboarding.setStorage': () => Promise.reject(daemonError('NOT_FOUND')),
    });
    await screen.findByRole('radio', { name: /External drive/ });
    chooseExternal();
    fireEvent.click(await screen.findByRole('radio', { name: /Samsung_T5/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('That drive was disconnected. Connect it again, or choose another.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Samsung_T5/ })).toHaveAttribute('aria-checked', 'false');
  });
});
