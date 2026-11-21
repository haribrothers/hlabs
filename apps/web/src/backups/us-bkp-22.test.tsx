// US-BKP-22 · Cancel a restore only before swap-in: "Cancel restore" while it can be (jobs.cancel), hidden from
// swap-in on.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers } from '../test/backups';
import { renderScreen } from '../test/render';
import { restoreView } from '../test/restore';
import { RestoreProgress } from './restore-flow';

describe('US-BKP-22', () => {
  it('before swap-in: Cancel restore calls jobs.cancel', async () => {
    const { calls } = renderScreen(
      () => <RestoreProgress jobId="j1" onClose={() => {}} />,
      backupsHandlers({ 'backups.getRestore': () => restoreView(), 'jobs.cancel': () => ({ ok: true }) }),
    );
    const dialog = await screen.findByRole('dialog', { name: /Restoring Vaultwarden/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel restore' }));
    await waitFor(() => expect(calls.find((c) => c.path === 'jobs.cancel')?.input).toEqual({ jobId: 'j1' }));
  });

  it('from swap-in on: no Cancel restore, only Hide', async () => {
    renderScreen(
      () => <RestoreProgress jobId="j1" onClose={() => {}} />,
      backupsHandlers({ 'backups.getRestore': () => restoreView({ cancellable: false }) }),
    );
    const dialog = await screen.findByRole('dialog', { name: /Restoring Vaultwarden/ });
    expect(within(dialog).queryByRole('button', { name: 'Cancel restore' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Hide' })).toBeInTheDocument();
  });

  it('cancelled: says so', async () => {
    renderScreen(
      () => <RestoreProgress jobId="j1" onClose={() => {}} />,
      backupsHandlers({ 'backups.getRestore': () => restoreView({ status: 'cancelled', cancellable: false }) }),
    );
    expect(await screen.findByRole('dialog', { name: /Restore cancelled/ })).toBeInTheDocument();
  });
});
