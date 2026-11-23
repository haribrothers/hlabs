// US-SYS-28 · Download a diagnostics bundle: "Download" builds the bundle as a job (the button says "Preparing…"
// meanwhile), then the browser saves hlabs-diagnostics-<hostname>-<date>.zip and a toast says passwords were removed.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderAdvanced } from '../test/advanced';

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});
afterEach(() => vi.restoreAllMocks());

const job = (state: string) => ({
  id: 'J1',
  kind: 'diagnostics',
  target: null,
  state,
  progress: state === 'succeeded' ? 100 : 40,
  message: null,
  hlabsCode: null,
  createdAt: 1,
  finishedAt: null,
});

describe('US-SYS-28', () => {
  it('Download builds the bundle as a job and saves it under the name hlabs gives', async () => {
    const save = vi.spyOn(browser, 'save').mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['zip']), {
        status: 200,
        headers: { 'content-disposition': 'attachment; filename="hlabs-diagnostics-hlabs-2026-11-23.zip"' },
      }),
    );
    let asked = 0;
    renderAdvanced({
      'system.diagnostics': () => ({ jobId: 'J1' }),
      'jobs.get': () => job(asked++ < 1 ? 'running' : 'succeeded'),
    });
    const row = await screen.findByRole('group', { name: 'Troubleshooting' });
    expect(within(row).getByText('Logs and system info, with passwords removed')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Download' }));
    expect(await within(row).findByRole('button', { name: /Preparing…/ })).toBeInTheDocument();
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.any(Blob), 'hlabs-diagnostics-hlabs-2026-11-23.zip'), {
      timeout: 3_000,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/diagnostics/J1', { credentials: 'same-origin' });
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Diagnostics bundle downloaded'));
  });

  it('a bundle that fails says so', async () => {
    renderAdvanced({ 'system.diagnostics': () => ({ jobId: 'J1' }), 'jobs.get': () => job('failed') });
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(currentToasts().map((t) => t.title)).toContain("Couldn't make the diagnostics bundle. Try again."),
    );
  });
});
