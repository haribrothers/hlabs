// US-SYS-44 · See and stop everything that's public (the menu-bar app, TrayPublic): while any app is public the menu
// shows "Public: 2 apps" with their names and "Turn off public access…", which does it after the computer's own
// confirmation (Touch ID or the password, as US-INST-18 does) and follows the job.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { RunningMenu, runningItems } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const status = (over: object = {}) =>
  ({
    state: 'running',
    appsRunning: 11,
    appsExpected: 11,
    appsNeedAttention: 0,
    startupLogAppId: null,
    paused: false,
    cpuPercent: 18,
    memoryUsedBytes: 9.4e9,
    freeBytes: 142e9,
    engine: { name: 'orbstack', running: true, managedByHlabs: false, canStart: true },
    dashboardUrl: 'https://hlabs.local',
    backup: { configured: false, lastSucceededAt: null, running: false, progress: null, lastFailed: false },
    updateChannel: 'stable',
    autoUpdate: true,
    exclusiveJobRunning: false,
    onboardingComplete: true,
    reduceTransparency: false,
    publicApps: 2,
    publicAppNames: ['Immich', 'Jellyfin'],
    ...over,
  }) as never;

/** The Rust side as `answer` has it, plus the OS confirmation and the public_off_all job. */
function withPublicOff({
  confirmed,
  jobStates = ['running', 'succeeded'],
}: {
  confirmed: boolean;
  jobStates?: string[];
}) {
  answer({});
  const base = tauri.invoke.getMockImplementation()!;
  const states = [...jobStates];
  tauri.invoke.mockImplementation(async (cmd: string, args?: { path?: string }) => {
    if (cmd === 'confirm_public_off') return confirmed;
    if (cmd === 'daemon_call' && args?.path === 'tray.publicOff') return { jobId: 'job-off' };
    if (cmd === 'daemon_call' && args?.path === 'tray.job') {
      const state = states.length > 1 ? states.shift()! : states[0]!;
      return { id: 'job-off', kind: 'public_off_all', state, progress: state === 'succeeded' ? 100 : 50 };
    }
    return base(cmd, args);
  });
}

const calls = (cmd: string, path?: string) =>
  tauri.invoke.mock.calls.filter(
    ([c, a]) => c === cmd && (path === undefined || (a as { path?: string } | undefined)?.path === path),
  );

describe('US-SYS-44', () => {
  beforeEach(() => {
    reset();
    answer({});
  });

  it('shows nothing about public access while no app is public', () => {
    render(<RunningMenu status={status({ publicApps: 0, publicAppNames: [] })} />);
    expect(screen.queryByText(/^Public:/)).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Turn off public access/ })).toBeNull();
  });

  it('shows "Public: 2 apps" with their names and "Turn off public access…" that asks for Touch ID', () => {
    render(<RunningMenu status={status()} />);
    const menu = screen.getByRole('menu', { name: 'hlabs' });
    expect(menu).toHaveTextContent('Public: 2 apps');
    expect(menu).toHaveTextContent('Immich, Jellyfin');
    const item = screen.getByRole('menuitem', { name: /Turn off public access…/ });
    expect(item).toHaveTextContent('Asks for Touch ID');
  });

  it('says "Public: 1 app" for one', () => {
    render(<RunningMenu status={status({ publicApps: 1, publicAppNames: ['Immich'] })} />);
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Public: 1 app');
  });

  it('comes first in the running menu, before Open Dashboard', () => {
    const labels = runningItems({ publicOff: { count: 2, names: ['Immich'], phase: 'idle', run: () => {} } }, 4)
      .filter((i) => !i.separator)
      .map((i) => i.label);
    expect(labels.slice(0, 2)).toEqual(['Turn off public access…', 'Open Dashboard']);
  });

  it('does nothing when the computer’s confirmation is cancelled', async () => {
    withPublicOff({ confirmed: false });
    render(<RunningMenu status={status()} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /Turn off public access…/ }));
    await waitFor(() => expect(calls('confirm_public_off')).toHaveLength(1));
    expect(calls('daemon_call', 'tray.publicOff')).toHaveLength(0);
  });

  it('once confirmed, turns everything off in one job and follows it to the end', async () => {
    withPublicOff({ confirmed: true });
    let refreshed = 0;
    render(<RunningMenu status={status()} onChanged={() => refreshed++} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /Turn off public access…/ }));
    await waitFor(() => expect(calls('daemon_call', 'tray.publicOff')).toHaveLength(1), { timeout: 4000 });
    await waitFor(() => expect(calls('notify')).toHaveLength(1), { timeout: 4000 });
    const jobs = calls('daemon_call', 'tray.job').map(([, a]) => (a as { input: unknown }).input);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(jobs[0]).toEqual({ jobId: 'job-off' });
    expect(calls('notify')[0]![1]).toEqual({
      title: 'Public access is off',
      body: 'Your apps are private again. Cloudflare Tunnel stays set up.',
    });
    expect(refreshed).toBeGreaterThan(0);
  });

  it('says it couldn’t when the job fails', async () => {
    withPublicOff({ confirmed: true, jobStates: ['failed'] });
    render(<RunningMenu status={status()} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /Turn off public access…/ }));
    expect(await screen.findByText("Couldn't turn off public access")).toBeInTheDocument();
    expect(calls('notify')).toHaveLength(0);
  });
});
