import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { StorageWidget } from './storage-widget';
import { visibleWidgets, WidgetsRow } from './widgets';

const summary = () => ({
  totalBytes: 256e9,
  freeBytes: 142e9,
  appsBytes: 77e9,
  filesBytes: 0,
  systemBytes: 37e9,
  hlabsBytes: 0,
  backupCacheBytes: 0,
  reclaimableImageBytes: 0,
});
const DEFAULT = ['live-usage', 'storage', 'remote-access', 'backups'];

describe('US-HOME-02', () => {
  it('keeps the saved order, hides widgets whose phase has not shipped, and shows at most four', () => {
    expect(visibleWidgets(DEFAULT, 1)).toEqual(['storage']);
    // Live usage from phase 4; Remote access and Backups arrive with their stories.
    expect(visibleWidgets(DEFAULT, 4)).toEqual(['live-usage', 'storage']);
    expect(visibleWidgets(DEFAULT, 5)).toEqual(['live-usage', 'storage']);
    expect(visibleWidgets(['storage', 'storage', 'storage', 'storage', 'storage'], 1)).toHaveLength(4);
    expect(visibleWidgets(['unknown'], 9)).toEqual([]);
  });

  it('Storage shows free space as the big figure, and Apps and System in a bar; it opens Usage', async () => {
    const { router } = renderScreen(() => <WidgetsRow ids={DEFAULT} />, { 'storage.summary': summary });
    const link = await screen.findByRole('link', { name: /^Storage ?142 GB ?left of 256 GB/ });
    expect(screen.getAllByText('142 GB')[0]).toHaveClass('tabular-nums');
    expect(screen.getByRole('img')).toHaveAccessibleName(/^Apps 77 GB, System 37 GB/);
    expect(screen.queryByText('Live usage')).toBeNull();
    fireEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/usage'));
  });

  it("a failed query shows Couldn't load with a retry button", async () => {
    const calls = vi.fn(() => Promise.reject(daemonError('INTERNAL')));
    renderScreen(StorageWidget, { 'storage.summary': calls });
    expect(await screen.findByText("Couldn't load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  });
});
