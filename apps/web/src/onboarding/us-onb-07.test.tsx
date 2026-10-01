import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { SystemStep } from './system-step';
import type { SystemCheck } from './system-rows';

const check = (
  engine: Partial<SystemCheck['engine']>,
  os: Partial<SystemCheck['os']> = { platform: 'linux', name: 'Ubuntu', version: '24.04' },
): SystemCheck => ({
  cpu: { model: 'AMD Ryzen 7 5800X 8-Core Processor', arch: 'x64' },
  os: { platform: 'linux', name: 'Ubuntu', version: '24.04', headless: false, ...os },
  engine: { kind: null, version: null, state: 'missing', level: 'error', install: null, ...engine },
  disk: { freeBytes: 142e9, path: '/home/h/hlabs', level: 'ok' },
  ports: {
    http: { port: 80, inUse: false, use: 80 },
    https: { port: 443, inUse: false, use: 443 },
    level: 'ok',
  },
  canContinue: engine.state === 'running',
  hostname: 'hlabs',
});

const running = { kind: 'docker-engine', version: '29.0.1', state: 'running', level: 'ok' } as const;

describe('US-ONB-07', () => {
  it('Linux with no engine shows the Docker Engine install command with Copy and Retry, and never installs', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    let result = check({});
    const installEngine = vi.fn();
    renderScreen(SystemStep, { 'onboarding.checkSystem': () => result, 'onboarding.installEngine': installEngine });

    expect(await screen.findByText('curl -fsSL https://get.docker.com | sh')).toHaveClass('font-mono');
    expect(screen.getByText(/Install Docker Engine with this command in a terminal/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy command' })));
    expect(writeText).toHaveBeenCalledWith('curl -fsSL https://get.docker.com | sh');

    result = check(running);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Docker Engine 29.0.1')).toBeInTheDocument();
    expect(installEngine).not.toHaveBeenCalled();
  });

  it('explains the docker group when this account cannot open the socket', async () => {
    renderScreen(SystemStep, {
      'onboarding.checkSystem': () => check({ kind: 'docker-engine', state: 'noAccess' }),
    });
    expect(await screen.findByText('No access')).toBeInTheDocument();
    expect(screen.getByText(/Add it to the docker group.*log out and back in/)).toBeInTheDocument();
    expect(screen.getByText('sudo usermod -aG docker $USER')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('a stopped Docker Desktop says so with Retry, and is not replaced by Colima', async () => {
    const installEngine = vi.fn();
    renderScreen(SystemStep, {
      'onboarding.checkSystem': () =>
        check({ kind: 'docker-desktop', state: 'stopped' }, { platform: 'darwin', name: 'macOS', version: '15' }),
      'onboarding.installEngine': installEngine,
    });
    expect(await screen.findByText('Docker Desktop is not running')).toBeInTheDocument();
    expect(screen.getByText('Start Docker Desktop, then press Retry.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled());
    expect(installEngine).not.toHaveBeenCalled();
  });

  it('hides the start-at-login switch until the tray ships (phase 4, D-042)', async () => {
    renderScreen(SystemStep, { 'onboarding.checkSystem': () => check(running) });
    await screen.findByText('Docker Engine 29.0.1');
    expect(screen.queryByRole('switch', { name: 'Start hlabs when I log in' })).toBeNull();
  });

  it('from phase 4, the switch is on by default and Continue sends the choice', async () => {
    const confirmSystem = vi.fn(() => ({ ok: true }));
    renderScreen(() => <SystemStep shippedPhase={4} />, {
      'onboarding.checkSystem': () => check(running),
      'onboarding.confirmSystem': confirmSystem,
      'onboarding.status': () => ({ completed: false, step: 'account', hasUsers: false }),
    });
    const toggle = await screen.findByRole('switch', { name: 'Start hlabs when I log in' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Keeps your apps running in the background from the menu bar')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(confirmSystem).toHaveBeenCalledWith({ startAtLogin: false, hostname: 'hlabs' }));
  });

  it('never shows the switch on headless Linux', async () => {
    renderScreen(() => <SystemStep shippedPhase={4} />, {
      'onboarding.checkSystem': () => check(running, { headless: true }),
    });
    await screen.findByText('Docker Engine 29.0.1');
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
