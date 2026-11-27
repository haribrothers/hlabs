// US-INST-07 · Back up now from the menu: hidden until backups ship (D-036); from phase 5 it says when the last good
// backup finished, starts a manual run, shows "Backing up… 34%" while one runs, "Last backup failed" (with the red dot)
// after a failure, opens the Backups page when there's no destination, and "Busy, try later" when a task holds it off.
import { FEATURE_PHASE, isFeatureEnabled } from '@hlabs/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUPS_PATH, BUSY_MS, lastBackupText } from '../src/backup';
import { iconFor } from '../src/icon';
import { RunningMenu, runningItems } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const BACKUPS = FEATURE_PHASE.backups;
const HOUR = 3_600_000;
const backup = (over: object = {}) => ({
  configured: true,
  lastSucceededAt: Date.now() - 2 * HOUR,
  running: false,
  progress: null,
  lastFailed: false,
  ...over,
});
const status = (b: object = {}) =>
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
    backup: backup(b),
    startAtLogin: true,
    updateChannel: 'stable',
    autoUpdate: true,
    exclusiveJobRunning: false,
    updateRequested: null,
    portProblem: null,
    onboardingComplete: true,
    reduceTransparency: false,
  }) as never;

const item = (name: RegExp | string) => screen.getByRole('menuitem', { name });
const quickActions = () =>
  tauri.invoke.mock.calls
    .filter(([cmd, a]) => cmd === 'daemon_call' && (a as { path: string }).path === 'tray.quickAction')
    .map(([, a]) => (a as { input: unknown }).input);

describe('US-INST-07 · Back up now from the menu', () => {
  beforeEach(() => {
    reset();
    answer({});
  });
  afterEach(() => vi.useRealTimers());

  it('is not in the menu before backups ship', () => {
    expect(BACKUPS).toBe(5);
    expect(isFeatureEnabled('backups', BACKUPS - 1)).toBe(false);
    expect(runningItems({}, BACKUPS - 1).some((i) => i.label === 'Back up now')).toBe(false);
  });

  it('from phase 5 it sits after "Copy dashboard address", as in the design', () => {
    const labels = runningItems({}, BACKUPS)
      .filter((i) => !i.separator)
      .map((i) => i.label);
    expect(labels.slice(0, 3)).toEqual(['Open Dashboard', 'Copy dashboard address', 'Back up now']);
  });

  it('with a destination it shows "Last: 2h ago", or "Last: never" before the first good run', () => {
    const { rerender } = render(<RunningMenu status={status()} phase={BACKUPS} />);
    expect(item(/Back up now/)).toHaveTextContent('Back up nowLast: 2h ago');
    rerender(<RunningMenu status={status({ lastSucceededAt: null })} phase={BACKUPS} />);
    expect(item(/Back up now/)).toHaveTextContent('Last: never');
  });

  it('writes the time since the last good run', () => {
    const now = 1_800_000_000_000;
    expect(lastBackupText(null, now)).toBe('Last: never');
    expect(lastBackupText(now - 20_000, now)).toBe('Last: just now');
    expect(lastBackupText(now - 5 * 60_000, now)).toBe('Last: 5m ago');
    expect(lastBackupText(now - 2 * HOUR, now)).toBe('Last: 2h ago');
    expect(lastBackupText(now - 3 * 24 * HOUR, now)).toBe('Last: 3d ago');
  });

  it('choosing it starts a manual run, and the menu asks for the status again', async () => {
    const onChanged = vi.fn();
    render(<RunningMenu status={status()} phase={BACKUPS} onChanged={onChanged} />);
    await userEvent.click(item(/Back up now/));
    expect(quickActions()).toEqual([{ action: 'backupNow' }]);
    expect(onChanged).toHaveBeenCalled();
  });

  it('while a backup runs it shows its progress and can’t be chosen', async () => {
    render(<RunningMenu status={status({ running: true, progress: 0.34 })} phase={BACKUPS} />);
    const running = item('Backing up… 34%');
    expect(running).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(running).catch(() => {});
    expect(quickActions()).toEqual([]);
  });

  it('after a good run "Last: just now"; after a failed one "Last backup failed" and the red dot', () => {
    const { rerender } = render(<RunningMenu status={status({ lastSucceededAt: Date.now() })} phase={BACKUPS} />);
    expect(item(/Back up now/)).toHaveTextContent('Last: just now');
    rerender(<RunningMenu status={status({ lastFailed: true })} phase={BACKUPS} />);
    expect(item(/Back up now/)).toHaveTextContent('Last backup failed');
    const failed = iconFor({
      boot: { firstLaunch: false, step: 'started', reason: null, setupOpened: false },
      access: 'ready',
      health: { state: 'up' },
      status: status({ lastFailed: true }),
      updateAvailable: true,
    });
    expect(failed).toMatchObject({ look: 'dot', dot: 'danger', line: 'Running · 11 apps · last backup failed' });
    const fine = iconFor({ boot: null, access: 'ready', health: { state: 'up' }, status: status() });
    expect(fine.dot).toBeNull();
  });

  it('with no destination it opens the dashboard’s Backups page instead', async () => {
    render(<RunningMenu status={status({ configured: false, lastSucceededAt: null })} phase={BACKUPS} />);
    const backUp = item('Back up now');
    expect(backUp).toHaveTextContent(/^Back up now$/);
    await userEvent.click(backUp);
    expect(quickActions()).toEqual([]);
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: BACKUPS_PATH });
  });

  it('when a restore or another exclusive task runs it says "Busy, try later" for 3 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fallback = tauri.invoke.getMockImplementation()!;
    tauri.invoke.mockImplementation(async (cmd: string, args?: { path?: string }) => {
      if (cmd === 'daemon_call' && args?.path === 'tray.quickAction')
        throw { kind: 'api', hlabsCode: 'JOB_EXCLUSIVE_RUNNING', status: 409 };
      return fallback(cmd, args);
    });
    render(<RunningMenu status={status()} phase={BACKUPS} />);
    await userEvent.click(item(/Back up now/));
    expect(item('Busy, try later')).toHaveAttribute('aria-disabled', 'true');
    await act(async () => vi.advanceTimersByTime(BUSY_MS));
    expect(item(/Back up now/)).toHaveTextContent('Last: 2h ago');
  });
});
