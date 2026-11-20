// US-BKP-23 · Choose what's included in backups: the link opens "What's included" with apps and files ticked, what a
// manifest leaves out, the always-included system part, the estimate, Save and Cancel.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers, overview } from '../test/backups';
import { renderScreen } from '../test/render';
import { BackupsPage } from './page.test-helper';

describe('US-BKP-23', () => {
  it('the link under the last backup opens it, everything ticked, Jellyfin’s library excluded, the system part fixed', async () => {
    renderScreen(BackupsPage, backupsHandlers());
    fireEvent.click(await screen.findByRole('button', { name: '11 apps, 2 Home folders and Shared' }));
    const dialog = await screen.findByRole('dialog', { name: "What's included" });
    for (const name of ['Immich', 'Jellyfin', 'Home › Anu', 'Home › Hari', 'Shared']) {
      expect(within(dialog).getByRole('checkbox', { name })).toBeChecked();
    }
    expect(dialog).toHaveTextContent('480 MB · library excluded');
    expect(within(dialog).getByRole('switch', { name: 'Include new apps automatically' })).toBeChecked();
    expect(dialog).toHaveTextContent('Always included');
    expect(dialog).toHaveTextContent('hlabs settings, users and app setup');
    expect(await within(dialog).findByText('About 45 GB per full copy')).toBeInTheDocument();
  });

  it('a change asks for a new estimate; Save keeps the list', async () => {
    const { calls } = renderScreen(BackupsPage, backupsHandlers({ 'backups.plan.update': () => ({ ok: true }) }));
    fireEvent.click(await screen.findByRole('button', { name: '11 apps, 2 Home folders and Shared' }));
    const dialog = await screen.findByRole('dialog', { name: "What's included" });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Immich' }));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Include new apps automatically' }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path === 'backups.plan.estimate' &&
            !(c.input as { include: { apps: string[] } }).include.apps.includes('immich'),
        ),
      ).toBe(true),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => c.path === 'backups.plan.update')!.input).toEqual({
      include: { apps: ['jellyfin'], folders: ['users/hari', 'users/anu', 'shared'], includeNewApps: false },
    });
  });

  it('an app left out while new apps aren’t included: “1 app not backed up”', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({ 'backups.overview': () => overview({ included: { apps: 10, folders: 3, notBackedUp: 1 } }) }),
    );
    expect(await screen.findByText(/1 app not backed up/)).toBeInTheDocument();
  });
});
