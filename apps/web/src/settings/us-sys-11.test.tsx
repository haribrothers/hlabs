// US-SYS-11 · See what is using storage: the disk's name and free space, a bar of Apps, Files, Backup cache and hlabs
// (decimal units, at most one decimal), "Low disk space" under 10% or 10 GB free, a skeleton while loading, and
// "Couldn't read storage. Try again." with a retry.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError } from '../test/render';
import { renderStorage, SUMMARY } from '../test/storage';
import { isLowSpace } from './storage-section';

const GB = 1e9;

describe('US-SYS-11', () => {
  it('names the disk, says how much is free and splits what uses it', async () => {
    renderStorage();
    const disk = await screen.findByRole('region', { name: 'This computer · internal SSD' });
    expect(within(disk).getByText('142 GB free of 256 GB')).toBeInTheDocument();
    const bar = within(disk).getByRole('img', { name: /What is using this disk/ });
    expect(bar).toHaveAccessibleName(
      expect.stringContaining('Apps 77 GB, Files 20 GB, Backup cache 10 GB, hlabs 7 GB, Free 142 GB'),
    );
    const legend = disk.querySelector('.hl-chart-legend')!;
    expect(legend).toHaveTextContent('Apps77 GBFiles20 GBBackup cache10 GBhlabs7 GBFree142 GB');
    // No "Other" when hlabs and the backup cache are all the system uses.
    expect(legend).not.toHaveTextContent('Other');
    expect(within(disk).queryByText('Low disk space')).toBeNull();
  });

  it('a tiny part still shows as a sliver; what else uses the disk is "Other"; one decimal at most', async () => {
    renderStorage({
      'storage.summary': () => ({ ...SUMMARY, hlabsBytes: 0.123456 * GB, systemBytes: 30 * GB, backupCacheBytes: 0 }),
    });
    const disk = await screen.findByRole('region', { name: 'This computer · internal SSD' });
    const bar = within(disk).getByRole('img', { name: /What is using this disk/ });
    expect(bar).toHaveAccessibleName(expect.stringContaining('hlabs 123 MB, Other 30 GB'));
    // The hlabs part (under 1%) is in the bar; the empty backup cache isn't.
    expect(bar.querySelectorAll('.hl-stack-seg')).toHaveLength(4);
  });

  it('"Low disk space" under a tenth free or under 10 GB', async () => {
    expect(isLowSpace({ totalBytes: 256 * GB, freeBytes: 25 * GB })).toBe(true);
    expect(isLowSpace({ totalBytes: 2000 * GB, freeBytes: 9.9 * GB })).toBe(true);
    expect(isLowSpace({ totalBytes: 256 * GB, freeBytes: 26 * GB })).toBe(false);
    renderStorage({ 'storage.summary': () => ({ ...SUMMARY, freeBytes: 8 * GB, diskKind: null }) });
    const disk = await screen.findByRole('region', { name: 'This computer' });
    expect(within(disk).getByText('Low disk space')).toBeInTheDocument();
  });

  it('a skeleton while loading, then on error "Couldn\'t read storage. Try again." and Try again', async () => {
    let fail = true;
    let answer!: () => void;
    const first = new Promise<void>((r) => (answer = r));
    const summary = vi.fn(async () => {
      await first;
      if (fail) throw daemonError('INTERNAL');
      return SUMMARY;
    });
    renderStorage({ 'storage.summary': summary });
    expect(await screen.findByRole('status', { name: 'Reading storage…' })).toBeInTheDocument();
    answer();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't read storage. Try again.");
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('142 GB free of 256 GB')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
