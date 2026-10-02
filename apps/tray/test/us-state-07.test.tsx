// US-STATE-07 · Show the daemon-down state in the tray: Restarting…, back to normal, and Updating hlabs….
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DaemonDownMenu, Menu } from '../src/menu';
import { answer, emit, reset, tauri } from './tauri';

const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };

describe('US-STATE-07 · Show the daemon-down state in the tray', () => {
  beforeEach(() => {
    reset();
    answer({ boot: started, health: { state: 'down', reason: null } });
  });

  it('Restart hlabs restarts the service and the header reads "Restarting…" until it answers', async () => {
    render(<Menu />);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restart hlabs' }));
    expect(tauri.invoke).toHaveBeenCalledWith('restart_daemon');
    act(() => emit('health-changed', { state: 'restarting' }));
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Restarting…');
    expect(screen.getByRole('menuitem', { name: 'Restart hlabs' })).toHaveAttribute('aria-disabled', 'true');
    act(() => emit('health-changed', { state: 'up' }));
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
  });

  it('a restart that did not bring hlabs back returns to "Can\'t reach hlabs"', async () => {
    render(<Menu />);
    await screen.findByRole('menuitem', { name: 'Restart hlabs' });
    act(() => emit('health-changed', { state: 'restarting' }));
    act(() => emit('health-changed', { state: 'down', reason: null }));
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent("Can't reach hlabs");
  });

  it('during an update says "Updating hlabs…" with no Restart', () => {
    render(<DaemonDownMenu health={{ state: 'updating' }} />);
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Updating hlabs…');
    expect(screen.queryByRole('menuitem', { name: 'Restart hlabs' })).not.toBeInTheDocument();
  });
});
