// US-INST-20 · Restart to update: "Restart to update" applies it (the Rust side: download and check, stop the daemon,
// replace the app, start it again, relaunch); an update the dashboard asked for is applied the same way; a running
// restore or data move makes it wait. One that can't be installed sends the menu back to normal, saying so.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu } from '../src/menu';
import { INSTALL_FAILED_MS } from '../src/updates';
import { answer, reset, tauri } from './tauri';

const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };
const status = (over: object = {}) => ({
  state: 'running',
  appsRunning: 11,
  appsExpected: 11,
  appsNeedAttention: 0,
  startupLogAppId: null,
  paused: false,
  cpuPercent: 10,
  memoryUsedBytes: 8e9,
  freeBytes: 142e9,
  engine: { name: 'orbstack', running: true, managedByHlabs: false, canStart: true },
  dashboardUrl: 'https://hlabs.local',
  backup: { configured: false, lastSucceededAt: null, running: false, progress: null, lastFailed: false },
  updateChannel: 'stable',
  autoUpdate: true,
  exclusiveJobRunning: false,
  updateRequested: null,
  onboardingComplete: true,
  reduceTransparency: false,
  ...over,
});
const applies = () => tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'apply_update').map(([, a]) => a);
const found = { version: '1.5.0', notes: null };

async function openUpdateMenu() {
  render(<Menu />);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Check for updates…' }));
  return screen.findByRole('button', { name: 'Restart to update' });
}

describe('US-INST-20 · Restart to update', () => {
  beforeEach(() => reset());

  it('"Restart to update" applies the update on the channel', async () => {
    answer({ boot: started, status: status(), update: found });
    const restart = await openUpdateMenu();
    await userEvent.click(restart);
    expect(applies()).toEqual([{ channel: 'stable' }]);
    await waitFor(() => expect(restart).toHaveAttribute('aria-busy', 'true'));
  });

  it('while a restore or data move runs, it waits: disabled, "Finish the running task first"', async () => {
    answer({ boot: started, status: status({ exclusiveJobRunning: true }), update: found });
    const restart = await openUpdateMenu();
    expect(restart).toBeDisabled();
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Finish the running task first');
  });

  it('an update the dashboard asked for is applied once, the same way', async () => {
    answer({ boot: started, status: status({ updateRequested: { jobId: 'job9', version: '1.5.0' } }) });
    render(<Menu />);
    expect(await screen.findByText('Version 1.5.0 is ready')).toBeInTheDocument();
    await waitFor(() => expect(applies()).toEqual([{ channel: 'stable' }]));
  });

  it("if it can't be installed (refused or broken), the menu goes back to normal and says so", async () => {
    answer({ boot: started, status: status(), update: found, applyFails: true });
    const restart = await openUpdateMenu();
    await userEvent.click(restart);
    expect(await screen.findByRole('menuitem', { name: "The update couldn't be installed" })).toBeInTheDocument();
    expect(screen.queryByText('Version 1.5.0 is ready')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Pause all apps' })).toBeInTheDocument();
  });

  it('after a failure, "Check for updates…" offers that version again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      answer({ boot: started, status: status(), update: found, applyFails: true });
      await userEvent.click(await openUpdateMenu());
      await screen.findByRole('menuitem', { name: "The update couldn't be installed" });
      await act(async () => vi.advanceTimersByTime(INSTALL_FAILED_MS));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Check for updates…' }));
      expect(await screen.findByText('Version 1.5.0 is ready')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an update the dashboard asked for that fails is not shown again', async () => {
    answer({
      boot: started,
      status: status({ updateRequested: { jobId: 'job9', version: '1.5.0' } }),
      applyFails: true,
    });
    render(<Menu />);
    expect(await screen.findByRole('menuitem', { name: "The update couldn't be installed" })).toBeInTheDocument();
    expect(screen.queryByText('Version 1.5.0 is ready')).not.toBeInTheDocument();
    expect(applies()).toHaveLength(1);
  });
});
