// US-SYS-45 · Make the dashboard public (the menu-bar app, TrayPublicDashboard): while the dashboard is public the
// card reads "Public: the dashboard and 2 apps" naming "hlabs dashboard" first, and "Turn off public access…" (after
// the computer's own confirmation) makes the dashboard private along with the apps.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { RunningMenu, publicTitle, runningItems } from '../src/menu';
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
    publicDashboard: true,
    ...over,
  }) as never;

const calls = (cmd: string, path?: string) =>
  tauri.invoke.mock.calls.filter(
    ([c, a]) => c === cmd && (path === undefined || (a as { path?: string } | undefined)?.path === path),
  );

describe('US-SYS-45', () => {
  beforeEach(() => {
    reset();
    answer({});
  });

  it('reads "Public: the dashboard and 2 apps", naming the dashboard first', () => {
    render(<RunningMenu status={status()} />);
    const menu = screen.getByRole('menu', { name: 'hlabs' });
    expect(menu).toHaveTextContent('Public: the dashboard and 2 apps');
    expect(menu).toHaveTextContent('hlabs dashboard, Immich, Jellyfin');
    expect(screen.getByRole('menuitem', { name: /Turn off public access…/ })).toHaveTextContent('Asks for Touch ID');
  });

  it('says "Public: the dashboard" when no app is public, and still offers to turn it off', () => {
    render(<RunningMenu status={status({ publicApps: 0, publicAppNames: [] })} />);
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Public: the dashboard');
    expect(screen.getByRole('menuitem', { name: /Turn off public access…/ })).toBeInTheDocument();
    expect(publicTitle(1, true)).toBe('Public: the dashboard and 1 app');
    expect(publicTitle(2, false)).toBe('Public: 2 apps');
  });

  it('shows nothing about public access while neither the dashboard nor an app is public', () => {
    render(<RunningMenu status={status({ publicApps: 0, publicAppNames: [], publicDashboard: false })} />);
    expect(screen.queryByText(/^Public:/)).toBeNull();
    const labels = runningItems({ publicOff: { count: 0, names: [], dashboard: true, phase: 'idle', run: () => {} } })
      .filter((i) => !i.separator)
      .map((i) => i.label);
    expect(labels[0]).toBe('Turn off public access…');
  });

  it('once confirmed, turns the dashboard and the apps off in one job and says so', async () => {
    answer({});
    const base = tauri.invoke.getMockImplementation()!;
    tauri.invoke.mockImplementation(async (cmd: string, args?: { path?: string }) => {
      if (cmd === 'confirm_public_off') return true;
      if (cmd === 'daemon_call' && args?.path === 'tray.publicOff') return { jobId: 'job-off' };
      if (cmd === 'daemon_call' && args?.path === 'tray.job')
        return { id: 'job-off', kind: 'public_off_all', state: 'succeeded', progress: 100 };
      return base(cmd, args);
    });
    render(<RunningMenu status={status()} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /Turn off public access…/ }));
    await waitFor(() => expect(calls('daemon_call', 'tray.publicOff')).toHaveLength(1), { timeout: 4000 });
    await waitFor(() => expect(calls('notify')).toHaveLength(1), { timeout: 4000 });
    expect(calls('notify')[0]![1]).toEqual({
      title: 'Public access is off',
      body: 'The dashboard and your apps are private again. Cloudflare Tunnel stays set up.',
    });
  });
});
