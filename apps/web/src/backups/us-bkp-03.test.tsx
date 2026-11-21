// US-BKP-03 · Review recent runs and run history: the latest runs with what they copied or why they failed, the chart
// with failed runs marked and a data table, and a run in progress first.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers, overview, run } from '../test/backups';
import { renderScreen } from '../test/render';
import { dayTime, runLine } from './format';
import { BackupsPage } from './page.test-helper';

describe('US-BKP-03', () => {
  it('“Today, 03:00 · 11 apps · 1.2 GB changed · 6 min · Succeeded”; a failed one says why, Details waits for phase 8', async () => {
    const at = new Date();
    at.setHours(3, 0, 0, 0);
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.listRuns': () => ({
          runs: [
            run({ startedAt: at.getTime(), finishedAt: at.getTime() + 6 * 60_000 }),
            run({ id: 'r2', status: 'failed', error: 'BACKUP_DEST_UNREACHABLE', startedAt: at.getTime() - 86_400_000 }),
          ],
          nextCursor: null,
        }),
      }),
    );
    const list = await screen.findByRole('group', { name: 'Recent runs' });
    expect(list).toHaveTextContent('Today, 03:00');
    expect(list).toHaveTextContent('11 apps · 1.2 GB changed · 6 min');
    expect(list).toHaveTextContent('Succeeded');
    expect(list).toHaveTextContent('NAS was not reachable');
    expect(list).toHaveTextContent('Failed');
    expect(within(list).queryByRole('button', { name: 'Details' })).toBeNull();
    expect(runLine(run({ status: 'failed', error: 'BACKUP_DEST_FULL', retry: true }))).toBe('Retry · NAS is full');
  });

  it('the chart: a bar per run, a failed one full height and marked, a data table, Left and Right between bars', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () =>
          overview({
            chart: [
              { id: 'a', startedAt: Date.now() - 50 * 3_600_000, status: 'succeeded', bytesAdded: 1e9 },
              { id: 'b', startedAt: Date.now() - 26 * 3_600_000, status: 'failed', bytesAdded: null },
              { id: 'c', startedAt: Date.now() - 2 * 3_600_000, status: 'succeeded', bytesAdded: 2e9 },
            ],
          }),
      }),
    );
    const chart = await screen.findByRole('group', { name: 'Backups in the last 30 runs' });
    const bars = within(chart).getAllByRole('img');
    expect(bars).toHaveLength(3);
    expect(bars[1]).toHaveAccessibleName(/failed/);
    expect(screen.getAllByTestId('failed-mark')).toHaveLength(1);
    expect(screen.getByRole('table')).toBeInTheDocument();
    bars[2]!.focus();
    fireEvent.keyDown(bars[2]!, { key: 'ArrowLeft' });
    expect(bars[1]).toHaveFocus();
  });

  it('a run in progress comes first: “Now · Backing up… 42%” with a progress bar', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () => overview({ running: { jobId: 'j1', progress: 42, message: null } }),
        'backups.listRuns': () => ({
          runs: [run({ id: 'now', status: 'running', finishedAt: null }), run()],
          nextCursor: null,
        }),
      }),
    );
    const list = await screen.findByRole('group', { name: 'Recent runs' });
    expect(list).toHaveTextContent('Now');
    expect(within(list).getAllByText('Backing up… 42%').length).toBeGreaterThan(0);
    expect(within(list).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(dayTime(Date.now(), Date.now())).toMatch(/^Today, /);
  });
});
