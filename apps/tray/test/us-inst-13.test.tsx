// US-INST-13 · Can't reach hlabs: the tray's daemon-down menu, none of whose actions need the API.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DaemonDownMenu, Menu } from '../src/menu';
import { answer, emit, reset, tauri } from './tauri';

const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };
const apiCalls = () => tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'daemon_call');

describe("US-INST-13 · Can't reach hlabs", () => {
  beforeEach(() => {
    reset();
    answer({ boot: started });
  });

  it('shows "Can\'t reach hlabs" with Restart hlabs, Show logs, Copy diagnostics, a separator and Quit', async () => {
    const { container } = render(<Menu />);
    await screen.findByRole('menu', { name: 'hlabs' });
    act(() => emit('health-changed', { state: 'down', reason: null }));
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent("Can't reach hlabs");
    const labels = [...container.querySelectorAll('.hl-menu-item')].map((el) => el.textContent);
    expect(labels).toEqual(['Restart hlabs', 'Show logs', 'Copy diagnostics', 'Quit hlabs⌘Q']);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);
  });

  it('Show logs and Copy diagnostics work without the API', async () => {
    render(<DaemonDownMenu health={{ state: 'down', reason: null }} />);
    const before = apiCalls().length;
    await userEvent.click(screen.getByRole('menuitem', { name: 'Show logs' }));
    expect(tauri.invoke).toHaveBeenCalledWith('show_logs');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy diagnostics' }));
    expect(tauri.invoke).toHaveBeenCalledWith('copy_local_diagnostics');
    expect(await screen.findByRole('menuitem', { name: 'Copied' })).toBeInTheDocument();
    expect(apiCalls().length).toBe(before);
  });

  it("shows /healthz's reason, and Open Dashboard opens the page that explains it", async () => {
    render(<DaemonDownMenu health={{ state: 'down', reason: 'migration_failed' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      "hlabs couldn't update its database. Your data hasn't been changed.",
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /Open Dashboard/ }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: null });
  });

  it("the first launch's 60 s without an answer shows the same menu", async () => {
    answer({ boot: { firstLaunch: true, step: 'failed', reason: null, setupOpened: false } });
    render(<Menu />);
    expect(await screen.findByText("Can't reach hlabs")).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Restart hlabs' })).toBeInTheDocument();
  });
});
