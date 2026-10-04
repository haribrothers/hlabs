import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { daemonError, renderScreen } from '../test/render';
import { StartupSettings } from './startup-settings';

let startup = { startAtLogin: true, autostartApps: true, keepAwake: true };

beforeEach(() => {
  startup = { startAtLogin: true, autostartApps: true, keepAwake: true };
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-SYS-20', () => {
  it('start apps automatically and keep this computer awake; start at login only once hlabs says it has a desktop', async () => {
    const update = vi.fn((change: Record<string, boolean>) => {
      startup = { ...startup, ...change };
      return { ok: true };
    });
    renderScreen(StartupSettings, { 'settings.get': () => ({ startup }), 'settings.startup.update': update as never });
    const autostart = await screen.findByRole('switch', { name: 'Start apps automatically' });
    expect(autostart).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Keep this computer awake' })).toBeChecked();
    expect(
      screen.getByText('Prevents sleep while apps are running; the display can still turn off'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Start hlabs when I log in' })).toBeNull();
    fireEvent.click(autostart);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ autostartApps: false }));
    await waitFor(() => expect(autostart).not.toBeChecked());
  });

  it('a switch that fails to save flips back and says so', async () => {
    renderScreen(StartupSettings, {
      'settings.get': () => ({ startup }),
      'settings.startup.update': () => Promise.reject(daemonError('INTERNAL')),
    });
    const awake = await screen.findByRole('switch', { name: 'Keep this computer awake' });
    fireEvent.click(awake);
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toEqual(["Couldn't save that. Try again."]));
    await waitFor(() => expect(awake).toBeChecked());
  });
});
