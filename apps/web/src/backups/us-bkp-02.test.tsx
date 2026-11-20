// US-BKP-02 · See destinations and the schedule summary: each destination with its place, space, restore points and
// state; the off-site hint; the schedule and retention, "Change" hidden until phase 9.
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers, destination, overview } from '../test/backups';
import { renderScreen } from '../test/render';
import { scheduleWords } from './format';
import { BackupsPage } from './page.test-helper';

describe('US-BKP-02', () => {
  it('a destination row: "NAS · nas.local/Backups", "Encrypted · 38 GB used · 42 restore points", Healthy, Edit', async () => {
    renderScreen(BackupsPage, backupsHandlers());
    const list = await screen.findByRole('group', { name: 'Destinations' });
    expect(list).toHaveTextContent('NAS · nas.local/Backups');
    expect(list).toHaveTextContent('Encrypted · 38 GB used · 42 restore points');
    expect(list).toHaveTextContent('Healthy');
    expect(screen.getByRole('button', { name: 'Edit NAS' })).toBeInTheDocument();
  });

  it('Unreachable and Needs attention badges; the off-site hint only without an off-site copy', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () =>
          overview({
            destinations: [
              destination({ status: 'unreachable' }),
              destination({ id: 'd2', name: 'B2', kind: 's3', status: 'attention', offsite: true }),
            ],
          }),
      }),
    );
    expect(await screen.findByText('Unreachable')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.queryByText(/off-site copy/)).toBeNull();
  });

  it('without one, the hint says why an off-site copy matters', async () => {
    renderScreen(BackupsPage, backupsHandlers());
    expect(
      await screen.findByText('An off-site copy (cloud or another drive) protects against theft or fire'),
    ).toBeInTheDocument();
  });

  it('“Every day at 03:00”, “Keeps 7 daily, 4 weekly and 6 monthly restore points”, no Change before phase 9', async () => {
    renderScreen(BackupsPage, backupsHandlers());
    const list = await screen.findByRole('group', { name: 'Schedule and retention' });
    expect(list).toHaveTextContent('Every day at 03:00');
    expect(list).toHaveTextContent('Keeps 7 daily, 4 weekly and 6 monthly restore points');
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(scheduleWords('0 3-23/6 * * *')).toBe('Every 6 hours from 03:00');
    expect(scheduleWords('0 3 * * 0')).toBe('Every Sunday at 03:00');
    expect(scheduleWords('*/5 * 1 * *')).toBe('On a custom schedule');
  });
});
