// US-INST-11 · Starting state: "Starting · 4 of 11 apps" with a bar, Show startup log, and the needs-attention line.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Menu, RunningMenu, StartingMenu } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const status = (over: object = {}) =>
  ({
    state: 'starting',
    appsRunning: 4,
    appsExpected: 11,
    appsNeedAttention: 0,
    startupLogAppId: 'jellyfin',
    paused: false,
    cpuPercent: 30,
    memoryUsedBytes: 8e9,
    freeBytes: 142e9,
    engine: { name: 'orbstack', running: true, managedByHlabs: false },
    dashboardUrl: 'https://hlabs.local',
    backup: { configured: false, lastSucceededAt: null, running: false, progress: null, lastFailed: false },
    updateChannel: 'stable',
    autoUpdate: true,
    exclusiveJobRunning: false,
    onboardingComplete: true,
    reduceTransparency: false,
    ...over,
  }) as never;

describe('US-INST-11 · Starting state', () => {
  beforeEach(() => {
    reset();
    answer({});
  });

  it('shows "Starting · 4 of 11 apps" with a bar and Open Dashboard, Show startup log, Quit', () => {
    const { container } = render(<StartingMenu status={status()} />);
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Starting · 4 of 11 apps');
    const bar = screen.getByRole('progressbar', { name: 'Starting · 4 of 11 apps' });
    expect(bar).toHaveAttribute('aria-valuenow', '36');
    const labels = [...container.querySelectorAll('.hl-menu-item')].map((el) => el.textContent);
    expect(labels).toEqual(['Open Dashboard⌘D', 'Show startup log', 'Quit hlabs⌘Q']);
  });

  it('"Show startup log" opens the logs of the first app still not running', async () => {
    render(<StartingMenu status={status()} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Show startup log' }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: '/apps/jellyfin/logs' });
  });

  it('"Show startup log" opens Home when every app is running', async () => {
    render(<StartingMenu status={status({ startupLogAppId: null })} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Show startup log' }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: '/' });
  });

  it('shows "Starting…" without counts while hlabs itself is still starting', async () => {
    answer({ boot: { firstLaunch: false, step: 'starting', reason: null, setupOpened: false } });
    render(<Menu />);
    expect(await screen.findByText('Starting…')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('turns into the normal menu once tray.status says running', async () => {
    answer({
      boot: { firstLaunch: false, step: 'started', reason: null, setupOpened: false },
      status: status({ state: 'running', appsRunning: 11 }),
    });
    render(<Menu />);
    expect(await screen.findByText('Running · 11 apps')).toBeInTheDocument();
  });

  it('an app in error leaves "Running · 10 of 11 apps · 1 needs attention"', () => {
    render(<RunningMenu status={status({ state: 'running', appsRunning: 10, appsNeedAttention: 1 })} />);
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent(
      'Running · 10 of 11 apps · 1 needs attention',
    );
  });

  it('two apps in error "need attention"', () => {
    render(<RunningMenu status={status({ state: 'running', appsRunning: 9, appsNeedAttention: 2 })} />);
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Running · 9 of 11 apps · 2 need attention');
  });
});
