// US-SYS-29 · See what hlabs connects to: a dialog lists each outside service with its host, why and when it was last
// contacted, "Off" for one that's off, and says hlabs sends no usage data or crash reports.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderAdvanced } from '../test/advanced';

const HOUR = 3_600_000;

describe('US-SYS-29', () => {
  it('lists every outside service with host, why and last contact, Off when off, and no telemetry', async () => {
    const now = Date.now();
    renderAdvanced({
      'system.connections': () => ({
        connections: [
          {
            id: 'store:l',
            kind: 'store',
            name: 'Family apps',
            host: 'https://github.com/anu/apps',
            state: 'on',
            lastContactAt: now - 2 * HOUR,
          },
          { id: 'registry:ghcr.io', kind: 'registry', name: null, host: 'ghcr.io', state: 'on', lastContactAt: null },
          { id: 'updates', kind: 'updates', name: null, host: 'github.com', state: 'on', lastContactAt: now - HOUR },
          {
            id: 'tailscale',
            kind: 'tailscale',
            name: null,
            host: 'controlplane.tailscale.com',
            state: 'off',
            lastContactAt: null,
          },
        ],
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'View What hlabs connects to' }));
    const dialog = await screen.findByRole('dialog', { name: 'What hlabs connects to' });
    expect(within(dialog).getByText('hlabs sends no usage data or crash reports.')).toBeInTheDocument();
    expect(await within(dialog).findByText('Family apps')).toBeInTheDocument();
    expect(within(dialog).getByText('https://github.com/anu/apps')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Checks for app updates every 6 hours · Last contacted 2 hours ago'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Container registry')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Downloads app images when you install or update an app · Not contacted yet'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Checks for hlabs updates every 6 hours · Last contacted 1 hour ago'),
    ).toBeInTheDocument();
    const tailscale = within(dialog).getByText('Tailscale').closest('.hl-list-row') as HTMLElement;
    expect(within(tailscale).getByText('Off')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
