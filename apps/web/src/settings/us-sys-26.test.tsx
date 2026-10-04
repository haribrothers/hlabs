// US-SYS-26 · Choose automatic updates.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { daemonError, renderScreen } from '../test/render';
import { UpdatesSection } from './updates-section';

let auto = { autoHlabs: true, autoApps: false, backupBeforeUpdate: true };
const status = () => ({
  version: '1.4.0',
  channel: 'stable',
  ...auto,
  lastCheckedAt: null,
  available: null,
  blockedBy: null,
});

beforeEach(() => {
  auto = { autoHlabs: true, autoApps: false, backupBeforeUpdate: true };
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-SYS-26', () => {
  it('hlabs overnight and apps that allow it; backing up first waits for backups (phase 5)', async () => {
    const setAuto = vi.fn((input: { hlabs: boolean; apps: boolean; backupBeforeUpdate: boolean }) => {
      auto = { autoHlabs: input.hlabs, autoApps: input.apps, backupBeforeUpdate: input.backupBeforeUpdate };
      return { ok: true };
    });
    renderScreen(UpdatesSection, {
      'settings.updates.get': status,
      'settings.updates.setAuto': setAuto as never,
      'events.stream': () => new Promise(() => {}),
    });
    const hlabs = await screen.findByRole('switch', { name: 'Update hlabs automatically' });
    expect(hlabs).toBeChecked();
    expect(screen.getByText('Installs overnight between 3 and 5 am')).toBeInTheDocument();
    const apps = screen.getByRole('switch', { name: 'Update apps automatically' });
    expect(apps).not.toBeChecked();
    expect(screen.getByText("Only apps you've allowed in their settings")).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Back up app data before updating' })).toBeNull();
    fireEvent.click(apps);
    await waitFor(() => expect(setAuto).toHaveBeenCalledWith({ hlabs: true, apps: true, backupBeforeUpdate: true }));
    await waitFor(() => expect(apps).toBeChecked());
  });

  it('a switch that fails to save flips back and says so', async () => {
    renderScreen(UpdatesSection, {
      'settings.updates.get': status,
      'settings.updates.setAuto': () => Promise.reject(daemonError('INTERNAL')),
      'events.stream': () => new Promise(() => {}),
    });
    const hlabs = await screen.findByRole('switch', { name: 'Update hlabs automatically' });
    fireEvent.click(hlabs);
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toEqual(["Couldn't save that. Try again."]));
    await waitFor(() => expect(hlabs).toBeChecked());
  });
});
