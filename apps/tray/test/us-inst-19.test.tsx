// US-INST-19 · Check for hlabs updates: the Tauri updater on the channel tray.status gives, 2 minutes after launch and
// every 6 hours; "Check for updates…" with its feedback; the "Update available" menu.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu } from '../src/menu';
import { CHECK_EVERY_MS, FEEDBACK_MS, FIRST_CHECK_MS } from '../src/updates';
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
  onboardingComplete: true,
  reduceTransparency: false,
  ...over,
});
const checks = () => tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'check_update').map(([, a]) => a);
const lastIcon = () =>
  tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'set_icon').at(-1)?.[1] as { request: { look: string } };

describe('US-INST-19 · Check for hlabs updates', () => {
  beforeEach(() => {
    reset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('checks the channel from tray.status 2 minutes after launch, then every 6 hours', async () => {
    answer({ boot: started, status: status({ updateChannel: 'beta' }) });
    render(<Menu />);
    await screen.findByText('Running · 11 apps');
    await act(() => vi.advanceTimersByTimeAsync(FIRST_CHECK_MS - 1_000));
    expect(checks()).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(checks()).toEqual([{ channel: 'beta' }]);
    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
    expect(checks()).toHaveLength(2);
  });

  it('"Check for updates…" says "Checking…", then "hlabs is up to date" for 3 s', async () => {
    let finish!: (v: null) => void;
    answer({ boot: started, status: status() });
    const base = tauri.invoke.getMockImplementation()!;
    tauri.invoke.mockImplementation((cmd: string, args?: unknown) =>
      cmd === 'check_update' ? new Promise((r) => (finish = r)) : base(cmd, args as never),
    );
    render(<Menu />);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Check for updates…' }));
    expect(screen.getByRole('menuitem', { name: 'Checking…' })).toBeInTheDocument();
    await act(async () => finish(null));
    expect(await screen.findByRole('menuitem', { name: 'hlabs is up to date' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(FEEDBACK_MS));
    expect(screen.getByRole('menuitem', { name: 'Check for updates…' })).toBeInTheDocument();
  });

  it('a manual check that fails says so for 3 s; an automatic one says nothing', async () => {
    answer({ boot: started, status: status(), update: 'fail' });
    render(<Menu />);
    await screen.findByText('Running · 11 apps');
    await act(() => vi.advanceTimersByTimeAsync(FIRST_CHECK_MS));
    expect(checks()).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: 'Check for updates…' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Check for updates…' }));
    expect(await screen.findByRole('menuitem', { name: "Couldn't check for updates" })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(FEEDBACK_MS));
    expect(screen.getByRole('menuitem', { name: 'Check for updates…' })).toBeInTheDocument();
  });

  it('an update found: "Version … is ready", "Restart to update", "What\'s new" (Settings › Updates), and a dot', async () => {
    answer({ boot: started, status: status(), update: { version: '1.5.0', notes: '- Faster' } });
    render(<Menu />);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Check for updates…' }));
    const menu = await screen.findByRole('menu', { name: 'hlabs' });
    expect(menu).toHaveTextContent('Running · 11 apps');
    expect(menu).toHaveTextContent('Version 1.5.0 is ready');
    expect(menu).toHaveTextContent('Apps restart for about a minute during the update.');
    expect(screen.getByRole('button', { name: 'Restart to update' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: "What's new" }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: '/settings/updates' });
    // The icon gets its accent dot (icon.ts resolves the token for Rust).
    expect(lastIcon().request.look).toBe('dot');
  });
});
