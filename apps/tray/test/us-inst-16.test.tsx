// US-INST-16 · Recover from a missing or mismatched tray token: what the menu shows when the tray has no access.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Menu } from '../src/menu';
import { answer, emit, reset, tauri } from './tauri';

const started = { firstLaunch: false, step: 'started', reason: null, setupOpened: false };

describe('US-INST-16 · Recover from a missing or mismatched tray token', () => {
  beforeEach(reset);

  it('asks for Keychain access with "Try again", which reads the token again', async () => {
    answer({ access: 'keychainDenied', retryAccess: 'ready', boot: started });
    render(<Menu />);
    expect(await screen.findByRole('alert')).toHaveTextContent('hlabs needs Keychain access to work.');
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent('Needs Keychain access');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(tauri.invoke).toHaveBeenCalledWith('retry_access');
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows "Can\'t reach hlabs" when the token is still rejected after one repair', async () => {
    answer({ boot: started });
    render(<Menu />);
    expect(await screen.findByText('Open Dashboard')).toBeInTheDocument();
    act(() => emit('access-changed', 'unreachable'));
    expect(screen.getByRole('menu', { name: 'hlabs' })).toHaveTextContent("Can't reach hlabs");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
