// US-SYS-13 · Free space from unused app images: "Free 6.2 GB" runs the job with a spinner, then "Freed 6.2 GB" (the
// amount the job freed) and the bar refreshes; with nothing to free the button reads "Nothing to clean up", disabled.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderStorage, SUMMARY } from '../test/storage';

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-SYS-13', () => {
  it('"Free 6.2 GB" runs the job with a spinner, then says what it freed and refreshes', async () => {
    let state = 'running';
    let summary = SUMMARY;
    const prune = vi.fn(() => ({ jobId: 'job1' }));
    const getSummary = vi.fn(() => summary);
    renderStorage({
      'storage.summary': getSummary,
      'storage.pruneImages': prune,
      'jobs.get': () => ({
        id: 'job1',
        kind: 'prune_images',
        target: null,
        state,
        progress: state === 'running' ? 40 : 100,
        message: state === 'running' ? null : JSON.stringify({ freedBytes: 6.1e9 }),
        hlabsCode: null,
        createdAt: 1,
        finishedAt: null,
      }),
    });
    const clean = await screen.findByRole('group', { name: 'Clean up' });
    expect(within(clean).getByText('Left over from updates and uninstalled apps')).toBeInTheDocument();
    fireEvent.click(await within(clean).findByRole('button', { name: 'Free 6.2 GB' }));
    await waitFor(() => expect(prune).toHaveBeenCalled());
    const busy = await within(clean).findByRole('button', { name: 'Freeing space…' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    const asked = getSummary.mock.calls.length;
    summary = { ...SUMMARY, reclaimableImageBytes: 0 };
    state = 'succeeded';
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Freed 6.1 GB'), { timeout: 3000 });
    expect(getSummary.mock.calls.length).toBeGreaterThan(asked);
    expect(await within(clean).findByRole('button', { name: 'Nothing to clean up' })).toBeDisabled();
  });

  it('nothing to free: "Nothing to clean up", disabled', async () => {
    renderStorage({ 'storage.summary': () => ({ ...SUMMARY, reclaimableImageBytes: 0 }) });
    const clean = await screen.findByRole('group', { name: 'Clean up' });
    expect(await within(clean).findByRole('button', { name: 'Nothing to clean up' })).toBeDisabled();
  });
});
