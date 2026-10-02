// US-INST-05 · See status at a glance: the menu's status line and stats from tray.status.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appsLine, formatCpu, formatFree, formatMemory } from '../src/format';
import { Menu, RunningMenu } from '../src/menu';
import { CLOSED_POLL_MS, OPEN_POLL_MS } from '../src/status';
import { trayCopy as t } from '../src/copy';
import { answer, reset, tauri } from './tauri';

const status = (over: object = {}) => ({
  state: 'running',
  appsRunning: 11,
  appsExpected: 11,
  paused: false,
  cpuPercent: 18.4,
  memoryUsedBytes: 9.4 * 1024 ** 3,
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
});
const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };

describe('US-INST-05 · See status at a glance', () => {
  beforeEach(reset);
  afterEach(() => vi.useRealTimers());

  it('shows "Running · 11 apps" and CPU 18%, Memory 9.4 GB, Free 142 GB', async () => {
    answer({ boot: started, status: status() });
    render(<Menu />);
    const menu = await screen.findByRole('menu', { name: 'hlabs' });
    expect(await within(menu).findByText('Running · 11 apps')).toBeInTheDocument();
    expect(menu).toHaveTextContent('CPU18%');
    expect(menu).toHaveTextContent('Memory9.4 GB');
    expect(menu).toHaveTextContent('Free142 GB');
  });

  it('shows dashes, never zero, until tray.status answers', () => {
    render(<RunningMenu status={null} />);
    const menu = screen.getByRole('menu', { name: 'hlabs' });
    expect(menu).toHaveTextContent('CPU–');
    expect(menu).toHaveTextContent('Memory–');
    expect(menu).toHaveTextContent('Free–');
    expect(menu).not.toHaveTextContent('0%');
  });

  it('gives the stats spoken labels', () => {
    render(<RunningMenu status={status() as never} />);
    expect(screen.getByText('CPU usage 18 percent')).toBeInTheDocument();
    expect(screen.getByText('Memory in use 9.4 GB')).toBeInTheDocument();
    expect(screen.getByText('Free space 142 GB')).toBeInTheDocument();
  });

  it('formats the numbers as the story says', () => {
    expect(formatCpu(18.4)).toBe('18%');
    expect(formatCpu(99.6)).toBe('100%');
    expect(formatMemory(9.4 * 1024 ** 3)).toBe('9.4 GB');
    expect(formatFree(142.4e9)).toBe('142 GB');
    expect(formatFree(999.4e9)).toBe('999 GB');
    expect(formatFree(1.25e12)).toBe('1.3 TB');
    expect(formatCpu(null)).toBe('–');
    expect(appsLine(0, t.runningApps)).toBe('Running · no apps');
    expect(appsLine(1, t.runningApps)).toBe('Running · 1 app');
    expect(appsLine(11, t.runningApps)).toBe('Running · 11 apps');
  });

  it('asks every 5 s while the menu is open and every 30 s while it is closed', async () => {
    expect(OPEN_POLL_MS).toBe(5_000);
    expect(CLOSED_POLL_MS).toBe(30_000);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answer({ boot: started, status: status() });
    render(<Menu />);
    await screen.findByText('Running · 11 apps');
    const asked = () =>
      tauri.invoke.mock.calls.filter(([, a]) => (a as { path?: string })?.path === 'tray.status').length;
    const before = asked();
    // jsdom has no focus: the menu counts as closed.
    await vi.advanceTimersByTimeAsync(CLOSED_POLL_MS);
    expect(asked() - before).toBe(1);
  });

  it('moves between items with the arrow keys (Esc closes the window, main.tsx)', async () => {
    const { container } = render(<RunningMenu status={status() as never} />);
    const items = [...container.querySelectorAll<HTMLElement>('.hl-menu-item')];
    items[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
  });
});
