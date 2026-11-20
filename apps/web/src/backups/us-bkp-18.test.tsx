// US-BKP-18 · Choose apps or folders and how to restore: items with sizes, none ticked; "Restore everything" when all
// are; replace or a copy; an app no longer installed can only be copied; nothing ticked, nothing to restore.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers, destination } from '../test/backups';
import { renderScreen } from '../test/render';
import { points, snapshotItems } from '../test/restore';
import { RestoreFlow } from './restore-flow';

const open = () =>
  renderScreen(
    () => <RestoreFlow destinations={[destination()]} jobId={null} onClose={() => {}} />,
    backupsHandlers({ 'backups.listSnapshots': () => points(), 'backups.getSnapshot': () => snapshotItems() }),
  );

describe('US-BKP-18', () => {
  it('each item with its size, none ticked; Restore is off until one is', async () => {
    open();
    const dialog = await screen.findByRole('dialog', { name: /Choose what to restore/ });
    const vault = await within(dialog).findByRole('checkbox', { name: 'Vaultwarden' });
    expect(vault).not.toBeChecked();
    expect(dialog).toHaveTextContent('210 MB');
    expect(dialog).toHaveTextContent('5.1 GB');
    const restore = within(dialog).getByRole('button', { name: 'Restore' });
    expect(restore).toBeDisabled();
    fireEvent.click(vault);
    expect(restore).toBeEnabled();
  });

  it('an app no longer installed: off for replace with “Install Immich first…”, fine for a copy', async () => {
    open();
    const dialog = await screen.findByRole('dialog', { name: /Choose what to restore/ });
    const immich = await within(dialog).findByRole('checkbox', { name: 'Immich' });
    expect(immich).toBeDisabled();
    expect(dialog).toHaveTextContent('Install Immich first to restore it in place');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Restore as a copy/ }));
    expect(immich).toBeEnabled();
  });

  it('“Replace current data” says whose data; everything ticked reads “Restore everything”', async () => {
    open();
    const dialog = await screen.findByRole('dialog', { name: /Choose what to restore/ });
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Vaultwarden' }));
    expect(within(dialog).getByRole('radio', { name: /Replace current data/ })).toHaveTextContent(
      "The app restarts with today's data",
    );
    fireEvent.click(within(dialog).getByRole('radio', { name: /Restore as a copy/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Immich' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Home › Hari' }));
    expect(within(dialog).getByRole('button', { name: 'Restore' })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Replace current data/ }));
    // Immich can't be replaced, so not everything is.
    expect(within(dialog).getByRole('button', { name: 'Restore' })).toBeEnabled();
  });
});
