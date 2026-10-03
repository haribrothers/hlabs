// US-SYS-42 · See why hlabs can't serve its address (the menu-bar app): "Can't use port 443", what holds it,
// "Use port 8443", Open Dashboard, and the icon's red dot.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Menu } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };
const status = (portProblem: unknown) => ({
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
  dashboardUrl: 'http://127.0.0.1:7474',
  backup: { configured: false, lastSucceededAt: null, running: false, progress: null, lastFailed: false },
  updateChannel: 'stable',
  autoUpdate: true,
  exclusiveJobRunning: false,
  updateRequested: null,
  portProblem,
  onboardingComplete: true,
  reduceTransparency: false,
});
const held = { port: 443, heldBy: 'tailscaleServe', fallbackPort: 8443 };
const daemonCalls = (path: string) =>
  tauri.invoke.mock.calls.filter(([cmd, a]) => cmd === 'daemon_call' && (a as { path: string }).path === path);
const lastIcon = () =>
  tauri.invoke.mock.calls.filter(([cmd]) => cmd === 'set_icon').at(-1)?.[1] as {
    request: { look: string; tooltip: string };
  };

describe('US-SYS-42 · See why hlabs can’t serve its address', () => {
  beforeEach(() => reset());

  it('says the port is in use by Tailscale Serve, with "Use port 8443" and a red dot', async () => {
    answer({ boot: started, status: status(held) });
    render(<Menu />);
    await screen.findByText("Can't use port 443");
    const menu = screen.getByRole('menu', { name: 'hlabs' });
    expect(menu).toHaveTextContent("Port 443 is in use by Tailscale Serve, so other devices can't reach hlabs.");
    await userEvent.click(screen.getByRole('button', { name: 'Use port 8443' }));
    await waitFor(() => expect(daemonCalls('tray.useOtherPort')).toHaveLength(1));
    await waitFor(() =>
      expect(lastIcon().request).toMatchObject({ look: 'dot', tooltip: "hlabs, Can't use port 443" }),
    );
  });

  it('when hlabs can’t tell what holds it, it says another program', async () => {
    answer({ boot: started, status: status({ ...held, heldBy: null }) });
    render(<Menu />);
    expect(
      await screen.findByText("Port 443 is in use by another program, so other devices can't reach hlabs."),
    ).toBeInTheDocument();
  });

  it('if 8443 is taken too, it says to choose another port in Settings', async () => {
    answer({ boot: started, status: status(held), otherPortTaken: true });
    render(<Menu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use port 8443' }));
    expect(
      await screen.findByText('Port 8443 is in use too. Choose another in Settings › Network.'),
    ).toBeInTheDocument();
  });

  it('Open Dashboard still opens the dashboard (on this computer)', async () => {
    answer({ boot: started, status: status(held) });
    render(<Menu />);
    await screen.findByText("Can't use port 443");
    await userEvent.click(screen.getByRole('menuitem', { name: /Open Dashboard/ }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: null });
  });
});
