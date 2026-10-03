// US-SYS-23 · Update hlabs.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { daemonError, renderScreen } from '../test/render';
import { UpdatesSection } from './updates-section';

const NOTES = ['Faster app installs', 'Live usage', 'Menu-bar app', 'Password reset', 'Updates'];
const status = (extra: Record<string, unknown> = {}) => ({
  version: '1.4.0',
  channel: 'stable',
  autoHlabs: true,
  autoApps: false,
  backupBeforeUpdate: true,
  lastCheckedAt: Date.now() - 90 * 60_000,
  available: { version: '1.5.0', notes: NOTES, url: 'https://github.com/haribrothers/hlabs/releases/tag/v1.5.0' },
  blockedBy: null,
  ...extra,
});

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-SYS-23', () => {
  it('a newer version: what it is, what changes, its notes and "Update now"', async () => {
    renderScreen(UpdatesSection, {
      'settings.updates.get': () => status(),
      'events.stream': () => new Promise(() => {}),
    });
    expect(await screen.findByRole('heading', { name: 'hlabs 1.5.0 is available' })).toBeInTheDocument();
    expect(screen.getByText('You have 1.4.0. Apps restart for about a minute.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(NOTES);
    const notes = screen.getByRole('link', { name: 'Full release notes' });
    expect(notes).toHaveAttribute('href', 'https://github.com/haribrothers/hlabs/releases/tag/v1.5.0');
    expect(notes).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: 'Update now' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
  });

  it('"Update now" starts the update', async () => {
    const install = vi.fn(() => ({ jobId: 'j1' }));
    renderScreen(UpdatesSection, {
      'settings.updates.get': () => status(),
      'settings.updates.install': install as never,
      'events.stream': () => new Promise(() => {}),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Update now' }));
    await waitFor(() => expect(install).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'Starting update…' })).toHaveAttribute('aria-busy', 'true');
  });

  it('while another job runs, "Update now" waits for it', async () => {
    renderScreen(UpdatesSection, {
      'settings.updates.get': () => status({ blockedBy: 'restore' }),
      'events.stream': () => new Promise(() => {}),
    });
    const button = await screen.findByRole('button', { name: 'Update now' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Wait for the restore to finish');
  });

  it("if the menu-bar app doesn't take it over, a toast says what to do", async () => {
    renderScreen(UpdatesSection, {
      'settings.updates.get': () => status(),
      'settings.updates.install': () => Promise.reject(daemonError('UPDATE_NOT_APPLIED')),
      'events.stream': () => new Promise(() => {}),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Update now' }));
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toEqual(["The update didn't start"]));
    expect(await screen.findByRole('button', { name: 'Update now' })).toBeEnabled();
  });
});
