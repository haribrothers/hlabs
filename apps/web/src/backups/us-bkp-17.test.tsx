// US-BKP-17 · Start a restore and pick a restore point: step 1 lists destinations (skipped with only one healthy),
// step 2 lists restore points newest first with the newest chosen; an unreachable destination offers Try again.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers, destination } from '../test/backups';
import { daemonError, renderScreen } from '../test/render';
import { points, snapshotItems } from '../test/restore';
import { RestoreFlow } from './restore-flow';

const handlers = (over: Record<string, (i: unknown) => unknown> = {}) =>
  backupsHandlers({ 'backups.listSnapshots': () => points(), 'backups.getSnapshot': () => snapshotItems(), ...over });

describe('US-BKP-17', () => {
  it('one healthy destination: straight to step 2, its restore points newest first, the newest chosen', async () => {
    renderScreen(() => <RestoreFlow destinations={[destination()]} jobId={null} onClose={() => {}} />, handlers());
    const dialog = await screen.findByRole('dialog', { name: /Choose what to restore/ });
    expect(dialog).toHaveTextContent('Step 2 of 3');
    const list = await within(dialog).findByRole('radiogroup', { name: 'Restore point · from NAS' });
    const radios = await within(list).findAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Today, \d\d:\d\d1\.2 GB changed$/),
      expect.stringMatching(/^(Today|Yesterday), \d\d:\d\d800 MB changed$/),
      'Weekly · 20 Sep',
    ]);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    // Back here closes the flow: step 1 was skipped.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('several healthy: step 1 lists them; an unreachable one can’t be chosen; Continue, then Back', async () => {
    renderScreen(
      () => (
        <RestoreFlow
          destinations={[
            destination(),
            destination({ id: 'd3', name: 'Backblaze', location: 's3.example.com/b', kind: 's3' }),
            destination({ id: 'd2', name: 'T7', location: 'Samsung T7', status: 'unreachable' }),
          ]}
          jobId={null}
          onClose={() => {}}
        />
      ),
      handlers(),
    );
    const step1 = await screen.findByRole('dialog', { name: /Choose where to restore from/ });
    expect(step1).toHaveTextContent('Step 1 of 3');
    expect(within(step1).getByRole('radio', { name: /T7/ })).toHaveAttribute('aria-disabled', 'true');
    expect(within(step1).getByRole('radio', { name: /^NAS/ })).toHaveTextContent('42 restore points · latest today');
    fireEvent.click(within(step1).getByRole('button', { name: 'Continue' }));
    const step2 = await screen.findByRole('dialog', { name: /Choose what to restore/ });
    fireEvent.click(within(step2).getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('dialog', { name: /Choose where to restore from/ })).toBeInTheDocument();
  });

  it('can’t reach it: “Can’t reach NAS right now” with Try again', async () => {
    let fail = true;
    renderScreen(
      () => <RestoreFlow destinations={[destination()]} jobId={null} onClose={() => {}} />,
      handlers({
        'backups.listSnapshots': () => {
          if (fail) throw daemonError('BACKUP_DEST_UNREACHABLE');
          return points();
        },
      }),
    );
    expect(await screen.findByText("Can't reach NAS right now")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('radio', { name: /Today/ })).not.toHaveLength(0);
  });
});
