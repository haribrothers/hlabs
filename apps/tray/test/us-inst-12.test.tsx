// US-INST-12 · Container engine stopped: the Error menu, Start engine, Troubleshoot… and Copy diagnostics.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_START_MS } from '../src/engine';
import { EngineStoppedMenu, Menu } from '../src/menu';
import { answer, reset, tauri } from './tauri';

const status = (engine: object = {}, over: object = {}) =>
  ({
    state: 'engineStopped',
    appsRunning: 0,
    appsExpected: 11,
    appsNeedAttention: 0,
    startupLogAppId: 'immich',
    paused: false,
    cpuPercent: 5,
    memoryUsedBytes: 4e9,
    freeBytes: 142e9,
    engine: { name: 'colima', running: false, managedByHlabs: true, canStart: true, ...engine },
    dashboardUrl: 'https://hlabs.local',
    backup: { configured: false, lastSucceededAt: null, running: false, progress: null, lastFailed: false },
    updateChannel: 'stable',
    autoUpdate: true,
    exclusiveJobRunning: false,
    onboardingComplete: true,
    reduceTransparency: false,
    ...over,
  }) as never;

const calls = (path: string) =>
  tauri.invoke.mock.calls.filter(([cmd, a]) => cmd === 'daemon_call' && (a as { path?: string }).path === path);

describe('US-INST-12 · Container engine stopped', () => {
  beforeEach(() => {
    reset();
    answer({});
  });
  afterEach(() => vi.useRealTimers());

  it('says the engine stopped, by name, with Start engine, Troubleshoot…, Copy diagnostics and Quit', async () => {
    answer({ boot: { firstLaunch: false, step: 'started', reason: null, setupOpened: false }, status: status() });
    const { container } = render(<Menu />);
    expect(await screen.findByText('Container engine stopped')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Colima isn't running, so your apps are offline.");
    expect(screen.getByRole('button', { name: 'Start engine' })).toBeEnabled();
    const labels = [...container.querySelectorAll('.hl-menu-item')].map((el) => el.textContent);
    expect(labels).toEqual(['Troubleshoot…', 'Copy diagnostics', 'Quit hlabs⌘Q']);
  });

  it('Start engine runs the job and shows "Starting engine…", disabled, until the engine answers', async () => {
    const { rerender } = render(<EngineStoppedMenu status={status()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start engine' }));
    expect(calls('tray.startEngine')).toHaveLength(1);
    const busy = screen.getByRole('button', { name: /Starting engine…/ });
    expect(busy).toBeDisabled();
    rerender(<EngineStoppedMenu status={status({ running: true })} />);
    expect(await screen.findByRole('button', { name: 'Start engine' })).toBeEnabled();
  });

  it('says "Engine didn\'t start" after 120 s and offers Start engine again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<EngineStoppedMenu status={status()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start engine' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ENGINE_START_MS);
    });
    expect(screen.getByRole('alert')).toHaveTextContent("Engine didn't start");
    expect(screen.getByRole('button', { name: 'Start engine' })).toBeEnabled();
  });

  it('Troubleshoot… opens the dashboard, where the engine-stopped page explains what to do', async () => {
    render(<EngineStoppedMenu status={status()} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Troubleshoot…' }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: '/' });
  });

  it('Copy diagnostics copies the redacted report and reads "Copied"', async () => {
    render(<EngineStoppedMenu status={status()} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy diagnostics' }));
    expect(tauri.invoke).toHaveBeenCalledWith('copy_text', { text: 'hlabs diagnostics' });
    expect(await screen.findByRole('menuitem', { name: 'Copied' })).toBeInTheDocument();
  });

  it('has no Start engine for Docker Engine on Linux', () => {
    render(<EngineStoppedMenu status={status({ name: 'docker-engine', canStart: false })} />);
    expect(screen.queryByRole('button', { name: 'Start engine' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Troubleshoot…' })).toBeInTheDocument();
  });
});
