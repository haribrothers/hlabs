import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { MyFilesWidget, SharedAppsWidget, sharedAppsLine } from './member-widgets';

const widgets = (data: Record<string, unknown>) => () =>
  Object.fromEntries(Object.entries(data).map(([id, d]) => [id, { status: 'ok', data: d, updatedAt: 0 }]));

describe('US-HOME-12', () => {
  it('"My files" shows the size of my Home folder', async () => {
    renderScreen(() => <MyFilesWidget />, {
      'home.getWidgetData': widgets({ 'my-files': { bytes: 4_200_000_000, lastPhotoBackupAt: null } }),
    });
    expect(await screen.findByText('4.2 GB')).toBeInTheDocument();
    expect(screen.getByText('in your Home folder')).toBeInTheDocument();
    expect(screen.queryByText(/Last photo backup/)).toBeNull();
  });

  it('says "Calculating…" until the size is known, and the last phone photo backup when Immich reports one', async () => {
    renderScreen(() => <MyFilesWidget />, {
      'home.getWidgetData': widgets({ 'my-files': { bytes: null, lastPhotoBackupAt: null } }),
    });
    expect(await screen.findByText('Calculating…')).toBeInTheDocument();
  });

  it('shows the photo backup line when there is one', async () => {
    renderScreen(() => <MyFilesWidget />, {
      'home.getWidgetData': widgets({ 'my-files': { bytes: 1, lastPhotoBackupAt: Date.now() - 20 * 60_000 } }),
    });
    expect(await screen.findByText('Last photo backup from your phone: 20 minutes ago')).toBeInTheDocument();
  });

  it('opens Files at my Home folder once Files ships', async () => {
    renderScreen(() => <MyFilesWidget shippedPhase={5} />, {
      'home.getWidgetData': widgets({ 'my-files': { bytes: 1, lastPhotoBackupAt: null } }),
    });
    expect(await screen.findByRole('link', { name: /My files/ })).toHaveAttribute('href', '/files');
  });

  it('"Shared with you by Hari": "4 apps · all running" or "3 of 4 running", and whom to ask', async () => {
    expect(sharedAppsLine({ total: 4, running: 4 })).toBe('4 apps · all running');
    expect(sharedAppsLine({ total: 4, running: 3 })).toBe('3 of 4 running');
    renderScreen(() => <SharedAppsWidget />, {
      'home.getWidgetData': widgets({ 'shared-apps': { total: 4, running: 4, adminName: 'Hari', canInstall: false } }),
    });
    expect(await screen.findByText('Shared with you by Hari')).toBeInTheDocument();
    expect(screen.getByText('4 apps · all running')).toBeInTheDocument();
    expect(screen.getByText('Ask Hari if you need another app')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('when members may install apps, it ends with "Browse the App Store" instead', async () => {
    renderScreen(() => <SharedAppsWidget />, {
      'home.getWidgetData': widgets({ 'shared-apps': { total: 2, running: 1, adminName: 'Hari', canInstall: true } }),
    });
    expect(await screen.findByRole('link', { name: 'Browse the App Store' })).toHaveAttribute('href', '/store');
    expect(screen.queryByText(/Ask Hari/)).toBeNull();
  });
});
