// US-INST-06 · Open the dashboard and copy its address: the menu items and ⌘D.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPIED_MS } from '../src/dashboard';
import { RunningMenu } from '../src/menu';
import { answer, reset, tauri } from './tauri';

describe('US-INST-06 · Open the dashboard and copy its address', () => {
  beforeEach(() => {
    reset();
    answer({});
  });
  afterEach(() => vi.useRealTimers());

  it('"Open Dashboard" asks the Rust side to open the current address', async () => {
    render(<RunningMenu status={null} />);
    await userEvent.click(screen.getByRole('menuitem', { name: /Open Dashboard/ }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: null });
  });

  it('⌘D opens the dashboard too', async () => {
    render(<RunningMenu status={null} />);
    await userEvent.keyboard('{Meta>}d{/Meta}');
    expect(tauri.invoke).toHaveBeenCalledWith('open_dashboard', { path: null });
  });

  it('"Copy dashboard address" copies it and reads "Copied" for 1.5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<RunningMenu status={null} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy dashboard address' }));
    expect(tauri.invoke).toHaveBeenCalledWith('copy_dashboard_address');
    expect(await screen.findByRole('menuitem', { name: 'Copied' })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COPIED_MS);
    });
    expect(screen.getByRole('menuitem', { name: 'Copy dashboard address' })).toBeInTheDocument();
  });

  it('says nothing was copied when the address could not be read', async () => {
    tauri.invoke.mockRejectedValueOnce({ kind: 'unreachable' });
    render(<RunningMenu status={null} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy dashboard address' }));
    expect(screen.queryByRole('menuitem', { name: 'Copied' })).not.toBeInTheDocument();
  });
});
