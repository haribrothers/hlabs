// US-BKP-01 · See the last backup's status: when it ran and what it covers, a failed one in the critical colour,
// "Overdue", and no destination yet.
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers, overview, run } from '../test/backups';
import { renderScreen } from '../test/render';
import { nextLine, whenNext } from './format';
import { BackupsPage } from './page.test-helper';

describe('US-BKP-01', () => {
  it('succeeded: "Last backup 2 hours ago", what it covers and when the next one is, with Restore… and Back up now', async () => {
    renderScreen(BackupsPage, backupsHandlers());
    const card = await screen.findByRole('region', { name: 'Last backup 2 hours ago' });
    expect(within(card).getByRole('button', { name: '11 apps, 2 Home folders and Shared' })).toBeInTheDocument();
    expect(card).toHaveTextContent('next backup tonight at 03:00');
    expect(screen.getByRole('button', { name: 'Restore…' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled();
  });

  it('failed: "Last backup failed · <when>" in the critical colour; overdue shows the badge', async () => {
    const failedAt = new Date();
    failedAt.setDate(failedAt.getDate() - 3);
    failedAt.setHours(3, 0, 0, 0);
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () =>
          overview({
            lastRun: run({ status: 'failed', startedAt: failedAt.getTime(), error: 'BACKUP_DEST_UNREACHABLE' }),
            overdue: true,
          }),
      }),
    );
    const title = await screen.findByText(/^Last backup failed · \d+ \w+, 03:00$/);
    expect(title).toHaveClass('text-danger');
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('no destination: "No backups yet", Back up now and Restore… off, + Add a destination the primary button', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () => overview({ destinations: [], lastRun: null, lastSuccessAt: null, chart: [] }),
      }),
    );
    expect(await screen.findByRole('region', { name: 'No backups yet' })).toHaveTextContent(
      'Add a destination to start backing up your apps and Home folders.',
    );
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add a destination' })).toHaveClass('hl-btn-primary');
  });

  it('the next-backup line: tonight, tomorrow, a weekday; "Scheduled backups are off"', () => {
    const now = new Date(2026, 10, 20, 15, 0).getTime();
    expect(whenNext(new Date(2026, 10, 21, 3, 0).getTime(), now)).toBe('tonight at 03:00');
    expect(whenNext(new Date(2026, 10, 21, 15, 0).getTime(), now)).toBe('tomorrow at 15:00');
    expect(whenNext(new Date(2026, 10, 20, 18, 0).getTime(), now)).toBe('today at 18:00');
    expect(whenNext(new Date(2026, 10, 24, 9, 0).getTime(), now)).toBe('on Tuesday at 09:00');
    expect(nextLine(null, false, now)).toBe('Scheduled backups are off');
  });
});
