// US-INST-20 · Restart to update: "Restart to update" applies it (the Rust side: download and check, stop the daemon,
// replace the app, start it again, relaunch); an update the dashboard asked for is applied the same way; a running
// restore or data move makes it wait.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Menu } from '../src/menu';
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

  it("if it can't be installed, the menu says so and it can be tried again", async () => {
    answer({ boot: started, status: status(), update: found, applyFails: true });
    const restart = await openUpdateMenu();
    await userEvent.click(restart);
    expect(await screen.findByText("The update couldn't be installed. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart to update' })).toBeEnabled();
  });
});
