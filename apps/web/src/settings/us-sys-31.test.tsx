// US-SYS-31 · Restart hlabs: "Restart" asks "Restart all apps?" (SysDialogs), then asks hlabs to restart and every route
// gives way to a full-screen "Restarting hlabs…" that reloads once /healthz answers again, or after 2 minutes shows
// "Can't reach hlabs". Restart is disabled while an exclusive job runs.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthCheck } from '../health/daemon-down';
import { HealthGate } from '../health/health-gate';
import { clearRestarting, markRestarting, RESTART_GIVE_UP_MS, restartingNow } from '../health/restarting';
import { renderAdvanced } from '../test/advanced';

beforeEach(() => {
  sessionStorage.clear();
  clearRestarting();
});
afterEach(() => vi.useRealTimers());

function gate(check: () => Promise<HealthCheck>, reload = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HealthGate check={check} reload={reload}>
        <p>dashboard</p>
      </HealthGate>
    </QueryClientProvider>,
  );
  return reload;
}

describe('US-SYS-31', () => {
  it('Restart asks "Restart all apps?" and then restarts hlabs', async () => {
    const restart = vi.fn(() => ({ ok: true }));
    renderAdvanced({ 'system.restartDaemon': restart });
    const danger = await screen.findByRole('group', { name: 'Danger zone' });
    expect(within(danger).getByText('Stops and starts every app · about 1 minute')).toBeInTheDocument();
    const button = within(danger).getByRole('button', { name: 'Restart' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const dialog = await screen.findByRole('alertdialog', { name: 'Restart all apps?' });
    expect(dialog).toHaveTextContent(
      'Apps will be unavailable for about a minute. Anyone watching or syncing will be disconnected.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(restart).toHaveBeenCalled());
    await waitFor(() => expect(restartingNow()?.kind).toBe('restarting'));
  });

  it('Cancel leaves hlabs running', async () => {
    const restart = vi.fn();
    renderAdvanced({ 'system.restartDaemon': restart });
    const button = await screen.findByRole('button', { name: 'Restart' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(restart).not.toHaveBeenCalled();
    expect(restartingNow()).toBeNull();
  });

  it('is disabled while an exclusive job runs, saying what to wait for', async () => {
    renderAdvanced({
      'jobs.list': () => ({
        items: [
          {
            id: 'j',
            kind: 'restore',
            target: null,
            state: 'running',
            progress: 10,
            message: null,
            hlabsCode: null,
            createdAt: 1,
            finishedAt: null,
          },
        ],
      }),
    });
    const danger = await screen.findByRole('group', { name: 'Danger zone' });
    expect(await within(danger).findByText('Wait for the restore to finish')).toBeInTheDocument();
    expect(within(danger).getByRole('button', { name: 'Restart' })).toBeDisabled();
  });

  it('"Restarting hlabs…" replaces every route and reloads the page once hlabs answers', async () => {
    vi.useFakeTimers();
    markRestarting();
    let back = false;
    const reload = gate(async () =>
      back ? { ok: true, reason: null, version: '0.7.0' } : { ok: false, reason: 'restarting' },
    );
    await act(async () => vi.advanceTimersByTime(10));
    expect(screen.queryByText('dashboard')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Restarting hlabs…' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Restarting hlabs…' })).toBeInTheDocument();
    back = true;
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(reload).toHaveBeenCalled();
    expect(restartingNow()).toBeNull();
  });

  it('/healthz saying "restarting" shows it on other pages; not back in 2 minutes is "Can\'t reach hlabs"', async () => {
    vi.useFakeTimers();
    gate(async () => ({ ok: false, reason: 'restarting' }));
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole('heading', { level: 1, name: 'Restarting hlabs…' })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(RESTART_GIVE_UP_MS + 2_000));
    expect(screen.getByRole('heading', { level: 1, name: "Can't reach hlabs" })).toBeInTheDocument();
  });
});
