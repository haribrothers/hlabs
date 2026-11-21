// US-BKP-21 · Roll back automatically if a restore fails: "Restore didn't finish. Vaultwarden is back to how it
// was." with the reason; success: "Vaultwarden restored" with Done.
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers } from '../test/backups';
import { renderScreen } from '../test/render';
import { restoreView } from '../test/restore';
import { RestoreProgress } from './restore-flow';

describe('US-BKP-21', () => {
  it('failed: the reason, the copy stopped where it got to, the safety copy put back', async () => {
    renderScreen(
      () => <RestoreProgress jobId="j1" onClose={() => {}} />,
      backupsHandlers({
        'backups.getRestore': () =>
          restoreView({
            status: 'failed',
            cancellable: false,
            error: 'BACKUP_DEST_UNREACHABLE',
            steps: [
              {
                kind: 'stop',
                appId: 'vaultwarden',
                state: 'done',
                startedAt: 0,
                finishedAt: 3000,
                bytesDone: null,
                bytesTotal: null,
              },
              {
                kind: 'safety',
                appId: null,
                state: 'done',
                startedAt: 3000,
                finishedAt: 15000,
                bytesDone: null,
                bytesTotal: null,
              },
              {
                kind: 'copy',
                appId: null,
                state: 'running',
                startedAt: 15000,
                finishedAt: null,
                bytesDone: 134e6,
                bytesTotal: 210e6,
              },
              {
                kind: 'putBack',
                appId: null,
                state: 'done',
                startedAt: 20000,
                finishedAt: 24000,
                bytesDone: null,
                bytesTotal: null,
              },
              {
                kind: 'start',
                appId: 'vaultwarden',
                state: 'done',
                startedAt: 24000,
                finishedAt: 41000,
                bytesDone: null,
                bytesTotal: null,
              },
            ],
          }),
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: /Restore didn't finish/ });
    expect(dialog).toHaveTextContent('Vaultwarden is back to how it was.');
    expect(within(dialog).getByRole('alert')).toHaveTextContent("Can't reach the backup destination");
    expect(dialog).toHaveTextContent('Stopped at 134 MB of 210 MB');
    expect(dialog).toHaveTextContent('Put the safety copy back');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cancel restore' })).toBeNull();
  });

  it('succeeded: “Vaultwarden restored”, the safety copy gone, Done', async () => {
    renderScreen(
      () => <RestoreProgress jobId="j1" onClose={() => {}} />,
      backupsHandlers({
        'backups.getRestore': () =>
          restoreView({
            status: 'succeeded',
            cancellable: false,
            steps: restoreView().steps.map((s) => ({ ...s, state: 'done', startedAt: 0, finishedAt: 5000 })),
          }),
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: /Vaultwarden restored/ });
    expect(dialog).toHaveTextContent('The safety copy has been deleted.');
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
