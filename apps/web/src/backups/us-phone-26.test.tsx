// US-PHONE-26 · Backups on the phone in the new design (PhoneRedesignA_Backups, _BackupsEmpty, _BackupAdd,
// _RestoreProgress; D-172, D-174): the last-backup card with its run bars and a white "Back up now", the destination,
// schedule and Restore… as inset rows, the recent runs with their status at the right; no destination: "No backups
// yet" and "Add a destination", Restore… off with a note; adding one is a sheet with Cancel in its bar and the choices
// as inset rows; a running restore is a sheet with its percentage. What each does is unchanged.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupsHandlers, overview, run } from '../test/backups';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { restoreView } from '../test/restore';
import { BackupsPage } from './page.test-helper';
import { RestoreProgress } from './restore-flow';

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => restore());

describe('US-PHONE-26', () => {
  it('the card: when the last backup ran, "Next: …", the runs as bars and a white "Back up now"', async () => {
    renderScreen(BackupsPage, backupsHandlers());
    const card = await screen.findByRole('region', { name: 'Last backup 2 hours ago' });
    expect(card).toHaveClass('hl-p-card');
    expect(card).toHaveTextContent('2 hours ago');
    expect(card).toHaveTextContent(/Next: (tonight|tomorrow) at 03:00/);
    expect(within(card).getByRole('img', { name: 'Last 2 backups: 2 succeeded' })).toBeInTheDocument();
    expect(card.querySelectorAll('.hl-p-runbar')).toHaveLength(2);
    expect(within(card).getByRole('button', { name: 'Back up now' })).toHaveClass('hl-p-primary');
    // The desktop's buttons beside the title aren't there too.
    expect(screen.getAllByRole('button', { name: 'Back up now' })).toHaveLength(1);
  });

  it('a failed run is a short red bar under ✕, named in the bars', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () =>
          overview({
            chart: [
              { id: 'r0', startedAt: Date.now() - 50 * 3_600_000, status: 'failed', bytesAdded: null },
              { id: 'r1', startedAt: Date.now() - 2 * 3_600_000, status: 'succeeded', bytesAdded: 1.2e9 },
            ],
          }),
      }),
    );
    const bars = await screen.findByRole('img', { name: /^Last 2 backups: 1 succeeded, 1 failed, the last on / });
    expect(bars.querySelectorAll('.hl-p-runbar-failed')).toHaveLength(1);
  });

  it('the destination, what is included, the schedule and Restore… as inset rows; the destination opens its editor', async () => {
    renderScreen(BackupsPage, backupsHandlers());
    const nas = await screen.findByRole('button', { name: /^NAS\s*nas\.local\/Backups/ });
    expect(nas).toHaveClass('hl-p-row');
    expect(nas.querySelector('.hl-p-sq[data-tone="store"]')).not.toBeNull();
    expect(nas).toHaveTextContent('Healthy');
    expect(nas.querySelector('.hl-p-chev')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Add a destination/ })).toHaveClass('hl-p-row-accent');
    expect(screen.getByRole('button', { name: /^What's included/ })).toBeEnabled();
    expect(screen.getByText('Schedule').closest('.hl-p-row')).toHaveTextContent('Every day at 03:00');
    expect(screen.getByRole('button', { name: 'Restore…' })).toBeEnabled();
    fireEvent.click(nas);
    expect(await screen.findByRole('dialog', { name: 'Edit NAS' })).toBeInTheDocument();
  });

  it('Recent: each run with its status at the right, a failed one in the critical colour', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.listRuns': () => ({
          runs: [run(), run({ id: 'r2', status: 'failed', error: 'BACKUP_DEST_UNREACHABLE' })],
          nextCursor: null,
        }),
      }),
    );
    const recent = await screen.findByRole('region', { name: 'Recent' });
    expect(within(recent).getByText('Succeeded').closest('.hl-p-run-status')).toHaveClass('text-success');
    expect(within(recent).getByText('Failed').closest('.hl-p-run-status')).toHaveClass('text-danger');
    expect(recent).toHaveTextContent('NAS was not reachable');
  });

  it('no destination: "No backups yet" with "Add a destination", the schedule, and Restore… off with its note', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () => overview({ destinations: [], lastRun: null, lastSuccessAt: null, chart: [] }),
        'backups.listRuns': () => ({ runs: [], nextCursor: null }),
      }),
    );
    const empty = await screen.findByRole('region', { name: 'No backups yet' });
    expect(empty.querySelector('.hl-p-empty-icon')).not.toBeNull();
    const add = within(empty).getByRole('button', { name: 'Add a destination' });
    expect(add).toHaveClass('hl-p-primary');
    expect(screen.getByRole('button', { name: 'Restore…' })).toBeDisabled();
    expect(screen.getByText('Restore turns on after your first backup.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back up now' })).toBeNull();
    fireEvent.click(add);
    expect(await screen.findByRole('dialog', { name: 'Add a backup destination' })).toBeInTheDocument();
  });

  it('adding a destination: a sheet with Cancel in its bar, the choices as inset rows with a checkmark, the buttons at the bottom', async () => {
    renderScreen(BackupsPage, backupsHandlers());
    fireEvent.click(await screen.findByRole('button', { name: /^Add a destination/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Add a backup destination' });
    expect(sheet).toHaveClass('hl-sheet');
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
    const bar = sheet.querySelector('.hl-sheet-bar') as HTMLElement;
    expect(within(bar).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(bar).getByText('Add a backup destination')).toBeInTheDocument();
    const types = within(sheet).getByRole('radiogroup', { name: 'Destination type' });
    expect(types).toHaveClass('hl-p-group');
    const network = within(types).getByRole('radio', { name: /Network drive/ });
    fireEvent.click(network);
    expect(network).toHaveAttribute('aria-checked', 'true');
    expect(network.querySelector('.hl-p-check')).not.toBeNull();
    const actions = sheet.querySelector('.hl-sheet-actions') as HTMLElement;
    expect(within(actions).getByRole('button', { name: 'Test connection' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Add destination' })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Add a backup destination' })).toBeNull();
  });

  it('a running restore: a sheet with the step, the title, its percentage, the steps as an inset list and the two buttons', async () => {
    renderScreen(
      () => <RestoreProgress jobId="j1" onClose={() => {}} />,
      backupsHandlers({ 'backups.getRestore': () => restoreView() }),
    );
    const sheet = await screen.findByRole('dialog', { name: /Restoring Vaultwarden/ });
    expect(sheet).toHaveClass('hl-sheet');
    expect(sheet).toHaveTextContent('Step 3 of 3');
    expect(within(sheet).getByRole('progressbar').parentElement?.parentElement).toHaveTextContent(/\d+%/);
    expect(within(sheet).getByRole('list')).toHaveClass('hl-p-group');
    expect(within(sheet).getByRole('button', { name: 'Hide' })).toBeInTheDocument();
  });
});
