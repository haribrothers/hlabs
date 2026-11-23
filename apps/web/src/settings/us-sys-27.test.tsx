// US-SYS-27 · View hlabs logs: "hlabs logs" › View opens a log window with the last 500 lines of the background
// service, the proxy or installs (Segmented), new lines as they come, Pause that stops following, search that marks
// matches, masked secrets as hlabs sends them, and "No log lines yet" without lines.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAdvanced } from '../test/advanced';
import { LOGS_POLL_MS } from './hlabs-logs';

afterEach(() => vi.useRealTimers());

const line = (at: number, text: string, level = 'info') => ({ at, level, text });

describe('US-SYS-27', () => {
  it('View opens the log window on the background service, with each source a choice and new lines as they come', async () => {
    let poll = 0;
    const logs = vi.fn((input: unknown) => {
      const { source, since } = input as { source: string; since?: number };
      if (source === 'proxy') return { lines: [] };
      if (since === undefined)
        return { lines: [line(1_000, 'hlabsd is ready'), line(2_000, 'token=•••• refused', 'warn')] };
      return { lines: poll++ === 0 ? [line(3_000, 'Immich installed')] : [] };
    });
    const { calls } = renderAdvanced({ 'system.logs': logs });
    const row = await screen.findByRole('group', { name: 'Troubleshooting' });
    expect(within(row).getByText('Background service, proxy and app installs')).toBeInTheDocument();
    fireEvent.click(within(row).getAllByRole('button', { name: 'View' })[0]!);
    const log = await screen.findByRole('log', { name: 'Background service' });
    expect(await within(log).findByText('hlabsd is ready')).toBeInTheDocument();
    expect(within(log).getByText('token=•••• refused')).toBeInTheDocument();
    expect(within(log).getByText('Warning')).toBeInTheDocument();
    expect(calls.find((c) => c.path === 'system.logs')?.input).toEqual({ source: 'daemon', limit: 500 });

    await waitFor(() => expect(within(log).getByText('Immich installed')).toBeInTheDocument(), {
      timeout: LOGS_POLL_MS + 1_000,
    });
    expect(calls.filter((c) => c.path === 'system.logs').at(-1)?.input).toMatchObject({
      source: 'daemon',
      since: expect.any(Number),
    });

    const sources = screen.getByRole('radiogroup', { name: 'Which log' });
    expect(
      within(sources)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Background service', 'Proxy', 'Installs']);
    fireEvent.click(within(sources).getByRole('radio', { name: 'Proxy' }));
    const proxy = await screen.findByRole('log', { name: 'Proxy' });
    expect(await within(proxy).findByText('No log lines yet')).toBeInTheDocument();
  });

  it('search marks the matches and says how many; Pause stops following and Resume follows again', async () => {
    renderAdvanced({
      'system.logs': (input) =>
        (input as { since?: number }).since === undefined
          ? { lines: [line(1, 'caddy is running'), line(2, 'Immich is ready'), line(3, 'Caddy reloaded')] }
          : { lines: [] },
    });
    fireEvent.click((await screen.findAllByRole('button', { name: 'View' }))[0]!);
    const log = await screen.findByRole('log');
    await within(log).findByText('Immich is ready');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'caddy' } });
    await waitFor(() => expect(within(log).getAllByText(/caddy/i, { selector: 'mark' })).toHaveLength(2));
    expect(screen.getByRole('status')).toHaveTextContent('2 matches');

    expect(log).toHaveAttribute('aria-live', 'off');
    const pause = screen.getByRole('button', { name: 'Pause' });
    fireEvent.click(pause);
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-pressed', 'true');
    expect(log).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {});
  });
});
