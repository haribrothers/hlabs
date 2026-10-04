// US-INST-08 · Pause and resume all apps: "Pause all apps", the Paused menu and "Resume apps".
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Menu, PausedMenu, RunningMenu } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };
const status = (over: object = {}) =>
  ({
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
    onboardingComplete: true,
    reduceTransparency: false,
    ...over,
  }) as never;

const quickActions = () =>
  tauri.invoke.mock.calls
    .filter(([cmd, a]) => cmd === 'daemon_call' && (a as { path: string }).path === 'tray.quickAction')
    .map(([, a]) => (a as { input: unknown }).input);

describe('US-INST-08 · Pause and resume all apps', () => {
  beforeEach(() => {
    reset();
    answer({});
  });

  it('"Pause all apps" asks the daemon to pause', async () => {
    render(<RunningMenu status={status()} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pause all apps' }));
    expect(quickActions()).toEqual([{ action: 'pauseAll' }]);
  });

  it('the Paused menu: "Paused · apps stopped", the note, Resume apps, and only Open Dashboard and Quit', () => {
    const { container } = render(<PausedMenu />);
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Paused · apps stopped');
    expect(
      screen.getByText('Your apps are stopped to save battery and memory. Data is untouched.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume apps' })).toBeEnabled();
    const labels = [...container.querySelectorAll('.hl-menu-item')].map((el) => el.textContent);
    expect(labels).toEqual(['Open Dashboard⌘D', 'Quit hlabs⌘Q']);
  });

  it('Resume apps asks the daemon to resume', async () => {
    render(<PausedMenu />);
    await userEvent.click(screen.getByRole('button', { name: 'Resume apps' }));
    expect(quickActions()).toEqual([{ action: 'resumeAll' }]);
  });

  it('shows the Paused menu when tray.status says paused', async () => {
    answer({ boot: started, status: status({ state: 'paused', paused: true, appsRunning: 0 }) });
    render(<Menu />);
    expect(await screen.findByText('Paused · apps stopped')).toBeInTheDocument();
  });
});
