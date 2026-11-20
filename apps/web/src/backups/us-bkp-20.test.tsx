// US-BKP-20 · Watch a restore in progress: "Restoring Vaultwarden", the steps in order with durations, the copy with
// bytes, the safety note, Hide; a running restore opens again when Backups does.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { backupsHandlers, overview } from '../test/backups';
import { renderScreen } from '../test/render';
import { restoreView } from '../test/restore';
import { BackupsPage } from './page.test-helper';
import { RestoreProgress } from './restore-flow';

describe('US-BKP-20', () => {
  it('the steps: Stopped Vaultwarden 3 s, Saved a safety copy 12 s, Copying data from NAS 134 of 210 MB, Starting', async () => {
    const onClose = vi.fn();
    renderScreen(
      () => <RestoreProgress jobId="j1" onClose={onClose} />,
      backupsHandlers({ 'backups.getRestore': () => restoreView() }),
    );
    const dialog = await screen.findByRole('dialog', { name: /Restoring Vaultwarden/ });
    expect(dialog).toHaveTextContent(/From yesterday, \d\d:\d\d · replacing current data/);
    const steps = within(dialog)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(steps).toEqual([
      'Stopped Vaultwarden3 s',
      'Saved a safety copy of current data12 s',
      'Copying data from NAS134 MB of 210 MB',
      'Starting Vaultwarden',
    ]);
    expect(within(dialog).getByRole('progressbar')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('If anything goes wrong, hlabs puts the safety copy back automatically.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('several apps: “Restoring 3 items”', async () => {
    renderScreen(
      () => <RestoreProgress jobId="j1" onClose={() => {}} />,
      backupsHandlers({
        'backups.getRestore': () =>
          restoreView({
            items: [
              { kind: 'app', id: 'a', label: 'A' },
              { kind: 'app', id: 'b', label: 'B' },
              { kind: 'folder', id: 'users/hari', label: 'Home › Hari' },
            ],
          }),
      }),
    );
    expect(await screen.findByRole('dialog', { name: /Restoring 3 items/ })).toBeInTheDocument();
  });

  it('opening Backups while a restore runs shows its progress again', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () => overview({ restoring: restoreView() }),
        'backups.getRestore': () => restoreView(),
      }),
    );
    expect(await screen.findByRole('dialog', { name: /Restoring Vaultwarden/ })).toBeInTheDocument();
  });
});
