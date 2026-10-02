// US-INST-02 · First launch hands off to onboarding in the browser: the window's side. The Rust side opens setup by
// itself once per launch (setupOpened) and on "Open setup" (open_setup).
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu } from '../src/menu';
import { SETUP_POLL_MS } from '../src/setup';
import { answer, emit, reset, tauri } from './tauri';

const URL = 'http://127.0.0.1:7474/setup?token=abc';
const boot = (over: object = {}) => ({ firstLaunch: true, step: 'started', reason: null, setupOpened: false, ...over });

describe('US-INST-02 · First launch hands off to onboarding in the browser', () => {
  beforeEach(reset);
  afterEach(() => vi.useRealTimers());

  it('shows "Opening setup in your browser…" and checks it off once the browser was opened', async () => {
    answer({ boot: boot(), setupUrl: URL });
    render(<Menu />);
    await screen.findByRole('region', { name: 'Setting up hlabs' });
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Opening setup in your browser… (in progress)');
    act(() => emit('boot-changed', boot({ setupOpened: true })));
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Opening setup in your browser… (done)');
  });

  it('"Open setup" stays available and asks the Rust side to fetch and open the URL again', async () => {
    answer({ boot: boot({ setupOpened: true }), setupUrl: URL });
    render(<Menu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open setup' }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_setup');
    expect(screen.getByRole('button', { name: 'Open setup' })).toBeInTheDocument();
  });

  it('has no "Open setup" until the background service has started', async () => {
    answer({ boot: boot({ step: 'starting' }) });
    render(<Menu />);
    await screen.findByRole('region', { name: 'Setting up hlabs' });
    expect(screen.queryByRole('button', { name: 'Open setup' })).not.toBeInTheDocument();
  });

  it('leaves the first-launch state within 5 s of onboarding completing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = { setupUrl: URL as string | null };
    answer({ boot: boot({ setupOpened: true }), setupUrl: URL });
    tauri.invoke.mockImplementation(async (cmd: string, args?: { path?: string }) => {
      if (cmd === 'daemon_call' && args?.path === 'tray.setupUrl') return { url: state.setupUrl, lanUrls: [] };
      if (cmd === 'boot_state') return boot({ setupOpened: true });
      return 'ready';
    });
    render(<Menu />);
    await screen.findByRole('region', { name: 'Setting up hlabs' });
    state.setupUrl = null;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SETUP_POLL_MS);
    });
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Setting up hlabs' })).not.toBeInTheDocument();
  });

  it('shows the setup state again on a later launch while onboarding is still incomplete', async () => {
    answer({ boot: boot({ firstLaunch: false }), setupUrl: URL });
    render(<Menu />);
    expect(await screen.findByRole('button', { name: 'Open setup' })).toBeInTheDocument();
  });

  it('a later launch with onboarding complete (kept data) goes straight to the menu', async () => {
    answer({ boot: boot({ firstLaunch: true }), setupUrl: null });
    render(<Menu />);
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
  });
});
