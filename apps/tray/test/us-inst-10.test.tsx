// US-INST-10 · Quit hlabs (D-120): every menu's "Quit hlabs" warns first that hlabs and every app will stop; confirmed,
// the menu says "Stopping apps…" while hlabs stops them, then the menu-bar app quits (quit_hlabs). Cancel does
// nothing; an update or a restore running makes it say to wait instead.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DaemonDownMenu, EngineStoppedMenu, Menu, PausedMenu, RunningMenu, StartingMenu } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const engineStopped = {
  state: 'engineStopped',
  appsRunning: 0,
  appsExpected: 1,
  appsNeedAttention: 0,
  startupLogAppId: null,
  engine: { name: 'colima', running: false, managedByHlabs: true, canStart: true },
} as never;
const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };
const running = (over: object = {}) => ({
  state: 'running',
  appsRunning: 2,
  appsExpected: 2,
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
const calls = (cmd: string) => tauri.invoke.mock.calls.filter(([c]) => c === cmd).map(([, a]) => a);

describe('US-INST-10 · Quit hlabs', () => {
  beforeEach(() => reset());

  const menus = {
    running: () => <RunningMenu status={null} />,
    starting: () => <StartingMenu status={null} />,
    paused: () => <PausedMenu />,
    engineStopped: () => <EngineStoppedMenu status={engineStopped} />,
    down: () => <DaemonDownMenu health={{ state: 'down', reason: null }} />,
  };

  for (const [name, menu] of Object.entries(menus)) {
    it(`"Quit hlabs" in the ${name} menu warns that hlabs and the apps will stop, then quits hlabs`, async () => {
      let finish!: (v: unknown) => void;
      answer({ confirm: true, quit: () => new Promise((r) => (finish = r)) });
      render(menu());
      await userEvent.click(screen.getByRole('menuitem', { name: /Quit hlabs/ }));
      expect(calls('confirm_dialog')).toEqual([
        {
          title: 'Quit hlabs?',
          message:
            'Your apps will stop, and nobody can reach them or the dashboard, at home or away, until you open hlabs again. Your data stays as it is.',
          ok: 'Quit hlabs',
          cancel: 'Cancel',
        },
      ]);
      await waitFor(() => expect(calls('quit_hlabs')).toHaveLength(1));
      expect(calls('quit_tray')).toEqual([]);
      await act(async () => finish(null));
    });
  }

  it('Cancel leaves everything running', async () => {
    answer({ confirm: false });
    render(<RunningMenu status={null} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /Quit hlabs/ }));
    await waitFor(() => expect(calls('confirm_dialog')).toHaveLength(1));
    expect(calls('quit_hlabs')).toEqual([]);
  });

  it('while the apps are being stopped the menu says "Stopping apps…"', async () => {
    let finish!: (v: unknown) => void;
    answer({ boot: started, status: running(), confirm: true, quit: () => new Promise((r) => (finish = r)) });
    render(<Menu />);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Quit hlabs/ }));
    expect(await screen.findByRole('menu', { name: 'hlabs' })).toHaveTextContent('Stopping apps…');
    await act(async () => finish(null));
  });

  it('during an update or a restore it says to wait, and nothing quits', async () => {
    answer({ boot: started, status: running({ exclusiveJobRunning: true }), confirm: true });
    render(<Menu />);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Quit hlabs/ }));
    await waitFor(() =>
      expect(calls('confirm_dialog')).toEqual([
        {
          title: 'hlabs is busy',
          message: "An update or a restore is running and can't be interrupted. Quit hlabs when it's done.",
          ok: 'OK',
          cancel: null,
        },
      ]),
    );
    expect(calls('quit_hlabs')).toEqual([]);
  });

  it('if hlabs refuses because something started meanwhile, the menu comes back and says to wait', async () => {
    answer({
      boot: started,
      status: running(),
      confirm: true,
      quit: () => Promise.reject({ hlabsCode: 'JOB_EXCLUSIVE_RUNNING', status: 409 }),
    });
    render(<Menu />);
    await userEvent.click(await screen.findByRole('menuitem', { name: /Quit hlabs/ }));
    await waitFor(() => expect(calls('confirm_dialog')).toHaveLength(2));
    expect((calls('confirm_dialog')[1] as { title: string }).title).toBe('hlabs is busy');
    expect(await screen.findByText(/Running · 2 apps/)).toBeInTheDocument();
  });
});
