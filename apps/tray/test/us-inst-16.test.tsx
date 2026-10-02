// US-INST-16 · Recover from a missing or mismatched tray token: what the menu shows when the tray has no access.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('US-INST-16 · Recover from a missing or mismatched tray token', () => {
  beforeEach(() => {
    invoke.mockReset();
    listeners.clear();
  });

  it('asks for Keychain access with "Try again", which reads the token again', async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === 'tray_access' ? 'keychainDenied' : 'ready'));
    render(<Menu />);
    expect(await screen.findByRole('alert')).toHaveTextContent('hlabs needs Keychain access to work.');
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Needs Keychain access');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(invoke).toHaveBeenCalledWith('retry_access');
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows "Can\'t reach hlabs" when the token is still rejected after one repair', async () => {
    invoke.mockResolvedValue('ready');
    render(<Menu />);
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
    act(() => listeners.get('access-changed')!({ payload: 'unreachable' }));
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent("Can't reach hlabs");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
