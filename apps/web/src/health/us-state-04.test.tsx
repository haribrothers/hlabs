import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DaemonDownController, type HealthCheck } from './daemon-down';
import { DaemonDownView } from './daemon-down-view';
import { HealthGate } from './health-gate';

afterEach(() => vi.useRealTimers());

const down: HealthCheck = { ok: false, reason: null };
const up: HealthCheck = { ok: true, reason: null };

describe('US-STATE-04', () => {
  it('"Can\'t reach hlabs": the retry line, Try now, and three numbered checks with the command to run', () => {
    const controller = new DaemonDownController({ check: async () => down, onBack: () => {} });
    render(<DaemonDownView controller={controller} />);
    expect(screen.getByRole('heading', { level: 1, name: "Can't reach hlabs" })).toBeInTheDocument();
    expect(screen.getByText('Trying again in 5 seconds…')).toBeInTheDocument();
    const checks = within(screen.getByRole('list', { name: 'Things to check' })).getAllByRole('listitem');
    expect(checks.map((c) => c.textContent)).toEqual([
      '1Check that the hlabs icon is in the menu bar (or tray) on the host computer.',
      '2Make sure that computer is awake and on the same network, or on Tailscale.',
      '3On a Linux server, run systemctl status hlabsd Copy command',
    ]);
    expect(screen.getByText('systemctl status hlabsd').tagName).toBe('CODE');
    expect(screen.getByRole('button', { name: 'Try now' })).toBeInTheDocument();
  });

  it('in the dashboard, 10 seconds of /healthz failing shows it; when hlabs answers the page comes back and refetches', async () => {
    vi.useFakeTimers();
    let answer = down;
    const check = vi.fn(async () => answer);
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'invalidateQueries');
    render(
      <QueryClientProvider client={queryClient}>
        <HealthGate check={check}>
          <p>dashboard</p>
        </HealthGate>
      </QueryClientProvider>,
    );
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('dashboard')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('heading', { name: "Can't reach hlabs" })).toBeInTheDocument();
    answer = up;
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('not while hlabs is updating', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HealthGate check={async () => ({ ok: false, reason: 'updating' })}>
          <p>dashboard</p>
        </HealthGate>
      </QueryClientProvider>,
    );
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});
