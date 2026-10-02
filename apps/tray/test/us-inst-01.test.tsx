// US-INST-01 · First launch installs the background service: what the window shows while it starts.
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const listeners = vi.hoisted(() => new Map<string, (e: { payload: unknown }) => void>());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, cb: (e: { payload: unknown }) => void) => {
    listeners.set(name, cb);
    return Promise.resolve(() => listeners.delete(name));
  },
}));

import { Menu } from '../src/menu';

function answer(boot: unknown) {
  invoke.mockImplementation(async (cmd: string) => (cmd === 'boot_state' ? boot : 'ready'));
}

describe('US-INST-01 · First launch installs the background service', () => {
  beforeEach(() => {
    invoke.mockReset();
    listeners.clear();
  });

  it('shows "Setting up hlabs" with the checklist while the background service starts', async () => {
    answer({ firstLaunch: true, step: 'starting', reason: null });
    render(<Menu />);
    const card = await screen.findByRole('region', { name: 'Setting up hlabs' });
    expect(card).toHaveTextContent('This happens once');
    const [service, browser] = screen.getAllByRole('listitem');
    expect(service).toHaveTextContent('Starting background service (in progress)');
    expect(browser).toHaveTextContent('Opening setup in your browser… (not started)');
  });

  it('checks off "Starting background service" once /healthz answers', async () => {
    answer({ firstLaunch: true, step: 'starting', reason: null });
    render(<Menu />);
    await screen.findByRole('region', { name: 'Setting up hlabs' });
    act(() => listeners.get('boot-changed')!({ payload: { firstLaunch: true, step: 'started', reason: null } }));
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Starting background service (done)');
  });

  it('switches to "Can\'t reach hlabs" when the daemon doesn\'t answer within 60 s', async () => {
    answer({ firstLaunch: true, step: 'starting', reason: null });
    render(<Menu />);
    await screen.findByRole('region', { name: 'Setting up hlabs' });
    act(() => listeners.get('boot-changed')!({ payload: { firstLaunch: true, step: 'failed', reason: null } }));
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent("Can't reach hlabs");
    expect(screen.queryByRole('region', { name: 'Setting up hlabs' })).not.toBeInTheDocument();
  });

  it('shows no first-launch window when hlabs has run before', async () => {
    answer({ firstLaunch: false, step: 'started', reason: null });
    render(<Menu />);
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Setting up hlabs' })).not.toBeInTheDocument();
  });
});
