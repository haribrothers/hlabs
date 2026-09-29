import { HEALTH_REASONS } from '@hlabs/api/health';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reasonCopy, reasonLine } from '../copy/health';
import { DaemonDownController, type HealthCheck } from './daemon-down';
import { DaemonDownView } from './daemon-down-view';

afterEach(() => vi.useRealTimers());

describe('US-STATE-05', () => {
  it('every /healthz reason has a line (or explicitly none), and update_stuck too', () => {
    for (const reason of HEALTH_REASONS) expect(reason in reasonCopy).toBe(true);
    expect(reasonLine('starting')).toBe('hlabs is starting. This usually takes less than a minute.');
    expect(reasonLine('daemon_unreachable')).toBeNull();
    expect(reasonLine('migration_failed')).toMatch(
      /^hlabs couldn't update its database\. Your data hasn't been changed\./,
    );
    expect(reasonLine('storage_unavailable')).toBe(
      "hlabs can't find its storage folder. Check that the drive is connected.",
    );
    expect(reasonLine('update_stuck')).toMatch(/^The update is taking longer than expected\./);
    expect(reasonLine('something new')).toBeNull();
    expect(reasonLine(null)).toBeNull();
  });

  it('the line changes in place and is announced; while starting the checklist is hidden', async () => {
    vi.useFakeTimers();
    let answer: HealthCheck = { ok: false, reason: 'starting' };
    const controller = new DaemonDownController({ check: async () => answer, onBack: () => {} });
    render(<DaemonDownView controller={controller} checkAtOnce />);
    await act(async () => {});
    const line = screen.getByText('hlabs is starting. This usually takes less than a minute.');
    expect(line).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('list', { name: 'Things to check' })).toBeNull();

    answer = { ok: false, reason: 'storage_unavailable' };
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(line).toHaveTextContent("hlabs can't find its storage folder. Check that the drive is connected.");
    expect(screen.getByRole('list', { name: 'Things to check' })).toBeInTheDocument();
  });
});
