// D-098 · The name on the network, on setup's system step: prefilled from the check, lowercased as it's typed, a name
// that isn't valid says how and holds Continue, and Continue sends it.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { SystemStep } from './system-step';
import type { SystemCheck } from './system-rows';

const check: SystemCheck = {
  cpu: { model: 'Apple M2', arch: 'arm64' },
  os: { platform: 'darwin', name: 'macOS', version: '15', headless: false },
  engine: { kind: 'orbstack', version: '27.0.0', state: 'running', level: 'ok', install: null },
  disk: { freeBytes: 142e9, path: '/Users/h/hlabs', level: 'ok' },
  ports: { http: { port: 80, inUse: false, use: 80 }, https: { port: 443, inUse: false, use: 443 }, level: 'ok' },
  canContinue: true,
  hostname: 'hlabs',
};

function open(handlers: Handlers = {}) {
  const confirmSystem = vi.fn(() => ({ ok: true }));
  renderScreen(SystemStep, {
    'onboarding.checkSystem': () => check,
    'onboarding.confirmSystem': confirmSystem,
    'onboarding.status': () => ({ completed: false, step: 'account', hasUsers: false }),
    ...handlers,
  });
  return confirmSystem;
}

describe('D-098', () => {
  it('shows the name with .local, prefilled; Continue sends the one typed, lowercased', async () => {
    const confirmSystem = open();
    const field = await screen.findByLabelText('Name on your network');
    expect(field).toHaveValue('hlabs');
    expect(screen.getByText('.local')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'Home Box' } });
    expect(field).toHaveValue('home-box');
    expect(screen.getByText(/Phones and computers open hlabs at home-box\.local/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(confirmSystem).toHaveBeenCalledWith({ startAtLogin: true, hostname: 'home-box' }));
  });

  it('a name that is not valid says how and holds Continue', async () => {
    open();
    const field = await screen.findByLabelText('Name on your network');
    fireEvent.change(field, { target: { value: 'home-' } });
    expect(
      screen.getByText('Use lowercase letters, numbers and dashes, starting and ending with a letter or number.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('a name an app already uses says so on the field', async () => {
    open({
      'onboarding.confirmSystem': () => {
        throw daemonError('HOSTNAME_TAKEN');
      },
    });
    fireEvent.change(await screen.findByLabelText('Name on your network'), { target: { value: 'jellyfin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('An app already uses this name. Pick another.')).toBeInTheDocument();
  });
});
