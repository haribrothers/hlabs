import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { nasFieldError, parseNasAddress } from './nas-form';
import { StorageStep } from './storage-step';

const check = () => ({ disk: { freeBytes: 142e9, path: '/Users/hari/hlabs', level: 'ok' } });

async function chooseNas() {
  fireEvent.click(await screen.findByRole('radio', { name: /Network storage \(NAS\)/ }));
}

function fill(address: string, username = '', password = '') {
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: address } });
  if (username) fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  if (password) fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

describe('US-ONB-16', () => {
  it('reads the address the way people type it', () => {
    expect(parseNasAddress('smb', 'nas.local/media')).toEqual({ host: 'nas.local', share: 'media' });
    expect(parseNasAddress('smb', 'smb://nas.local/media/')).toEqual({ host: 'nas.local', share: 'media' });
    expect(parseNasAddress('smb', '\\\\nas\\media')).toEqual({ host: 'nas', share: 'media' });
    expect(parseNasAddress('nfs', 'nas.local:/export/media')).toEqual({ host: 'nas.local', share: '/export/media' });
    expect(parseNasAddress('nfs', 'nas.local/export/media')).toEqual({ host: 'nas.local', share: '/export/media' });
    expect(parseNasAddress('smb', 'nas.local')).toBeNull();
    expect(parseNasAddress('smb', '')).toBeNull();
  });

  it('puts each refusal next to the right field', () => {
    const where = { host: 'nas.local', share: 'media' };
    expect(nasFieldError('NAS_AUTH_FAILED', undefined, where)).toEqual({
      field: 'password',
      message: 'Wrong username or password.',
    });
    expect(nasFieldError('NAS_UNREACHABLE', 'unreachable', where)).toMatchObject({
      field: 'address',
      message: expect.stringContaining("Can't reach nas.local"),
    });
    expect(nasFieldError('NAS_UNREACHABLE', 'noShare', where).message).toBe(
      "There's no share called “media” on nas.local.",
    );
    expect(nasFieldError('NAS_UNREACHABLE', 'privilegedPort', where).message).toMatch(/non-privileged ports/);
    expect(nasFieldError('NAS_READ_ONLY', undefined, where).field).toBe('address');
    expect(nasFieldError('NAS_HELPER_MISSING', undefined, where).field).toBe('form');
  });

  it('shows protocol, address, and for SMB a username and password', async () => {
    renderScreen(StorageStep, { 'onboarding.checkSystem': check });
    await chooseNas();
    expect(screen.getByRole('radiogroup', { name: 'Protocol' })).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toHaveAccessibleDescription('For example nas.local/media');
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('radio', { name: 'NFS' }));
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('tests the connection, adds the share and makes it the root', async () => {
    const testNetwork = vi.fn(() => ({ ok: true }));
    const addNetwork = vi.fn(() => ({ locationId: 'loc1' }));
    const setStorage = vi.fn(() => ({ ok: true }));
    const { router } = renderScreen(StorageStep, {
      'onboarding.checkSystem': check,
      'storage.locations.testNetwork': testNetwork,
      'storage.locations.addNetwork': addNetwork,
      'onboarding.setStorage': setStorage,
      'onboarding.status': () => ({ completed: false, step: 'done', hasUsers: true }),
      'onboarding.complete': () => ({ redirectTo: '/' }),
    });
    await chooseNas();
    fill('nas.local/media', 'hari', 's3cret');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/done'));
    const share = { protocol: 'smb', host: 'nas.local', share: 'media', username: 'hari', password: 's3cret' };
    expect(testNetwork).toHaveBeenCalledWith(share);
    expect(addNetwork).toHaveBeenCalledWith(share);
    expect(setStorage).toHaveBeenCalledWith({ kind: 'nas', locationId: 'loc1' });
  });

  it('a wrong login shows on the password; a missing share on the address; nothing is added', async () => {
    const addNetwork = vi.fn();
    let refusal = daemonError('NAS_AUTH_FAILED');
    renderScreen(StorageStep, {
      'onboarding.checkSystem': check,
      'storage.locations.testNetwork': () => Promise.reject(refusal),
      'storage.locations.addNetwork': addNetwork,
    });
    await chooseNas();
    fill('nas.local/media', 'hari', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Wrong username or password.'),
    );

    refusal = daemonError('NAS_UNREACHABLE', { reason: 'noShare' });
    fill('nas.local/movies');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Address')).toHaveAccessibleDescription(
        "There's no share called “movies” on nas.local.",
      ),
    );
    expect(addNetwork).not.toHaveBeenCalled();
  });

  it('an address without a share is caught before anything is sent', async () => {
    const testNetwork = vi.fn();
    renderScreen(StorageStep, { 'onboarding.checkSystem': check, 'storage.locations.testNetwork': testNetwork });
    await chooseNas();
    fill('nas.local');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('Address')).toHaveAccessibleDescription(
      'Enter the address as name/share, for example nas.local/media',
    );
    expect(testNetwork).not.toHaveBeenCalled();
  });
});
