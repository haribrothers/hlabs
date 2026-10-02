// US-INST-10 · Quit hlabs: every menu's "Quit hlabs" quits only the menu-bar app, with nothing asked and nothing sent to
// hlabs, which keeps running.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DaemonDownMenu, EngineStoppedMenu, PausedMenu, RunningMenu, StartingMenu } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const status = {
  state: 'engineStopped',
  appsRunning: 0,
  appsExpected: 1,
  appsNeedAttention: 0,
  startupLogAppId: null,
  engine: { name: 'colima', running: false, managedByHlabs: true, canStart: true },
} as never;

describe('US-INST-10 · Quit hlabs', () => {
  beforeEach(() => {
    reset();
    answer({});
  });

  const menus = {
    running: () => <RunningMenu status={null} />,
    starting: () => <StartingMenu status={null} />,
    paused: () => <PausedMenu />,
    engineStopped: () => <EngineStoppedMenu status={status} />,
    down: () => <DaemonDownMenu health={{ state: 'down', reason: null }} />,
  };

  for (const [name, menu] of Object.entries(menus)) {
    it(`"Quit hlabs" quits the menu-bar app from the ${name} menu, without asking or calling hlabs`, async () => {
      render(menu());
      await userEvent.click(screen.getByRole('menuitem', { name: /Quit hlabs/ }));
      expect(tauri.invoke).toHaveBeenCalledWith('quit_tray');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'daemon_call')).toEqual([]);
    });
  }
});
