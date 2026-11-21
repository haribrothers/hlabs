// US-INST-26 · Native tray menu on Linux desktops (D-145): the menu window's items go to a native menu: the status line
// as a disabled item ("hlabs · Running · 11 apps"), the items in LinuxTray's order with "Start at login" ticked, the
// state's action swapped in ("Resume apps"); choosing one runs the same handler; a Mac sends nothing; on Linux the
// status is asked every 5 s whether or not the menu is open.
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PausedMenu, RunningMenu } from '../src/menu';
import { nativeItems, type NativeItem } from '../src/native-menu';
import { useMenuOpen } from '../src/status';
import { answer, emit, reset, tauri } from './tauri';

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
    engine: { name: 'docker-engine', running: true, managedByHlabs: false, canStart: false },
    dashboardUrl: 'https://hlabs.local',
    backup: { configured: true, lastSucceededAt: null, running: false, progress: null, lastFailed: false },
    updateChannel: 'stable',
    autoUpdate: true,
    exclusiveJobRunning: false,
    onboardingComplete: true,
    reduceTransparency: false,
    startAtLogin: true,
    ...over,
  }) as never;

const sent = (): NativeItem[] => {
  const calls = tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'set_native_menu');
  return (calls.at(-1)?.[1] as { items: NativeItem[] } | undefined)?.items ?? [];
};
const labels = (items: NativeItem[]) =>
  items.map((i) => (i.kind === 'separator' ? '—' : `${i.checked ? '✓ ' : ''}${i.label}${i.enabled ? '' : ' (off)'}`));

const userAgent = navigator.userAgent;
function asLinux() {
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (X11; Linux x86_64) WebKitGTK',
    configurable: true,
  });
}

describe('US-INST-26 · Native tray menu on Linux desktops', () => {
  beforeEach(() => {
    reset();
    answer({});
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  });

  it('the running menu, in LinuxTray’s order, with the status line disabled, Start at login ticked and no Uninstall', async () => {
    asLinux();
    render(
      <RunningMenu
        status={status()}
        phase={6}
        startAtLogin={{ checked: true, failed: false, toggle: () => {} }}
        checkUpdates={{ feedback: null, run: () => {} }}
      />,
    );
    await act(async () => {});
    expect(labels(sent())).toEqual([
      'hlabs · Running · 11 apps (off)',
      'Open Dashboard',
      'Copy dashboard address',
      'Back up now',
      '—',
      '✓ Start at login',
      'Pause all apps',
      'Check for updates…',
      'Reset a password…',
      '—',
      'Quit hlabs',
    ]);
  });

  it('a state swaps its action in, and choosing an item runs its handler', async () => {
    asLinux();
    render(<PausedMenu />);
    await act(async () => {});
    const items = sent();
    expect(labels(items).slice(0, 2)).toEqual(['hlabs · Paused · apps stopped (off)', 'Resume apps']);
    await act(async () => emit('native-menu', 'action'));
    expect(tauri.invoke).toHaveBeenCalledWith('daemon_call', {
      kind: 'mutation',
      path: 'tray.quickAction',
      input: { action: 'resumeAll' },
    });
  });

  it('a Mac sends no native menu', async () => {
    render(<PausedMenu />);
    await act(async () => {});
    expect(tauri.invoke.mock.calls.some(([cmd]) => cmd === 'set_native_menu')).toBe(false);
  });

  it('on Linux the menu counts as open, so the status is asked every 5 s', () => {
    asLinux();
    expect(renderHook(() => useMenuOpen()).result.current).toBe(true);
  });

  it('separators only between items, and only string labels with handlers are enabled', () => {
    const onSelect = vi.fn();
    const { items, handlers } = nativeItems({
      status: 'Running',
      items: [
        { separator: true },
        { label: 'Open Dashboard', onSelect },
        { separator: true },
        { separator: true },
        { label: 'Show logs' },
        { separator: true },
      ],
    });
    expect(labels(items)).toEqual(['hlabs · Running (off)', 'Open Dashboard', '—', 'Show logs (off)']);
    handlers.get('item-1')?.();
    expect(onSelect).toHaveBeenCalled();
  });
});
