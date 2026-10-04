// US-INST-09 · Start at login: the tray applies it (login item and RunAtLoad) and confirms with tray.setStartAtLogin.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Menu } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };
const status = (startAtLogin: boolean) =>
  ({
    state: 'running',
    appsRunning: 1,
    appsExpected: 1,
    appsNeedAttention: 0,
    startupLogAppId: null,
    paused: false,
    cpuPercent: 10,
    memoryUsedBytes: 8e9,
    freeBytes: 142e9,
    engine: { name: 'orbstack', running: true, managedByHlabs: false, canStart: true },
    dashboardUrl: 'https://hlabs.local',
    backup: { configured: false, lastSucceededAt: null, running: false, progress: null, lastFailed: false },
    startAtLogin,
    updateChannel: 'stable',
    autoUpdate: true,
    exclusiveJobRunning: false,
    onboardingComplete: true,
    reduceTransparency: false,
  }) as never;

const osChanges = () => tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'set_start_at_login').map(([, a]) => a);
const confirmations = () =>
  tauri.invoke.mock.calls
    .filter(([cmd, a]) => cmd === 'daemon_call' && (a as { path: string }).path === 'tray.setStartAtLogin')
    .map(([, a]) => (a as { input: unknown }).input);

describe('US-INST-09 · Start at login', () => {
  beforeEach(reset);

  it("shows the OS's state as a check, and toggling it changes the OS first, then tells the daemon", async () => {
    answer({ boot: started, status: status(true), startAtLogin: true });
    render(<Menu />);
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Start at login' });
    await waitFor(() => expect(item).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(item);
    expect(osChanges()).toEqual([{ enabled: false }]);
    await waitFor(() => expect(confirmations()).toEqual([{ enabled: false }]));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Start at login' })).toHaveAttribute('aria-checked', 'false');
  });

  it('applies a choice made in Settings (or while the tray was closed) and confirms it', async () => {
    answer({ boot: started, status: status(false), startAtLogin: true });
    render(<Menu />);
    await waitFor(() => expect(osChanges()).toEqual([{ enabled: false }]));
    await waitFor(() => expect(confirmations()).toEqual([{ enabled: false }]));
  });

  it('a refused change keeps the switch where it was and says "Couldn\'t change login setting"', async () => {
    answer({ boot: started, status: status(true), startAtLogin: true, loginRefused: true });
    render(<Menu />);
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Start at login' });
    await userEvent.click(item);
    const failed = await screen.findByRole('menuitemcheckbox', { name: "Couldn't change login setting" });
    expect(failed).toHaveAttribute('aria-checked', 'true');
    expect(confirmations()).toEqual([]);
  });
});
