// US-SYS-30 · Opt in to beta updates: the "Beta updates" Switch sets the update channel (the daemon checks at once);
// a switch that can't be saved flips back; Settings › Updates shows "Beta" next to the version on the beta channel.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderAdvanced, UPDATES } from '../test/advanced';
import { daemonError, renderScreen } from '../test/render';
import { UpdatesSection } from './updates-section';

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-SYS-30', () => {
  it('turning Beta updates on sets the channel to beta', async () => {
    let channel: 'stable' | 'beta' = 'stable';
    const setChannel = vi.fn((input: unknown) => {
      channel = (input as { channel: 'stable' | 'beta' }).channel;
      return { ok: true };
    });
    renderAdvanced({
      'settings.updates.get': () => ({ ...UPDATES, channel }),
      'settings.updates.setChannel': setChannel,
    });
    const developer = await screen.findByRole('group', { name: 'Developer' });
    expect(within(developer).getByText('Get new versions early; may be less stable')).toBeInTheDocument();
    const toggle = within(developer).getByRole('switch', { name: 'Beta updates' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    await waitFor(() => expect(setChannel).toHaveBeenCalledWith({ channel: 'beta' }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(currentToasts().map((t) => t.title)).toContain('Beta updates are on. hlabs is checking for a new version.');
    fireEvent.click(toggle);
    await waitFor(() => expect(setChannel).toHaveBeenLastCalledWith({ channel: 'stable' }));
  });

  it("a switch that can't be saved flips back", async () => {
    renderAdvanced({
      'settings.updates.setChannel': () => {
        throw daemonError('INTERNAL');
      },
    });
    const toggle = await screen.findByRole('switch', { name: 'Beta updates' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain("Couldn't save that. Try again."));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('Settings › Updates says "Beta" next to the version on the beta channel', async () => {
    renderScreen(UpdatesSection, {
      'settings.updates.get': () => ({ ...UPDATES, version: '0.8.0-beta.1', channel: 'beta' }),
      'store.listUpdates': () => ({ pending: [], rolledBack: [], recent: [], lastCheckedAt: null }),
      'events.stream': () => new Promise(() => {}),
    });
    expect(await screen.findByText('Version 0.8.0-beta.1')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
