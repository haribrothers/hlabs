// US-BKP-04 · Back up now: starts a run, the button follows it and is off meanwhile, a toast says it started; an
// exclusive task in the way turns it off with "Wait for the current task to finish".
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { backupsHandlers, overview } from '../test/backups';
import { renderScreen } from '../test/render';
import { BackupsPage } from './page.test-helper';

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-BKP-04', () => {
  it('Back up now starts a run: “Backup started”, then “Backing up… 0%” and off', async () => {
    const { calls } = renderScreen(BackupsPage, backupsHandlers({ 'backups.runNow': () => ({ jobId: 'j1' }) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(calls.some((c) => c.path === 'backups.runNow')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Backing up… 0%' })).toBeDisabled();
    expect(currentToasts().map((t) => t.title)).toContain('Backup started');
  });

  it('a running backup shows its progress on the button', async () => {
    renderScreen(
      BackupsPage,
      backupsHandlers({
        'backups.overview': () => overview({ running: { jobId: 'j1', progress: 42, message: null } }),
      }),
    );
    expect(await screen.findByRole('button', { name: 'Backing up… 42%' })).toBeDisabled();
  });

  it('during a restore or update: off, with “Wait for the current task to finish”', async () => {
    renderScreen(BackupsPage, backupsHandlers({ 'backups.overview': () => overview({ blockedBy: 'restore' }) }));
    const button = await screen.findByRole('button', { name: 'Back up now' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Wait for the current task to finish');
  });
});
