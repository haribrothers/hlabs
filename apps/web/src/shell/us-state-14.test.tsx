import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast, SEVERITY_TONE, showToast } from '../lib/toasts';
import { renderWithDaemon } from '../test/render';
import { Toaster } from './toaster';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
  vi.useRealTimers();
});

const titles = () => currentToasts().map((t) => t.title);

describe('US-STATE-14', () => {
  it('success and neutral go after 5 s, warning after 10 s, danger stays', () => {
    vi.useFakeTimers();
    showToast({ tone: 'success', title: 'Immich is ready', body: 'Open it from your Home screen.' });
    showToast({ tone: 'neutral', title: 'Checking for updates' });
    showToast({ tone: 'warning', title: 'Low disk space' });
    vi.advanceTimersByTime(4_999);
    expect(titles()).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(titles()).toEqual(['Low disk space']);
    vi.advanceTimersByTime(5_000);
    expect(titles()).toEqual([]);
    showToast({ tone: 'danger', title: "Uptime Kuma couldn't start" });
    vi.advanceTimersByTime(10 * 60_000);
    expect(titles()).toEqual(["Uptime Kuma couldn't start"]);
  });

  it('maps notification severities to tones', () => {
    expect(SEVERITY_TONE).toEqual({ success: 'success', info: 'neutral', warning: 'warning', critical: 'danger' });
  });

  it('each tone has an icon; danger is an alert, the rest are polite status messages; Dismiss is labelled', () => {
    renderWithDaemon(<Toaster />);
    act(() => {
      for (const tone of ['neutral', 'warning', 'danger'] as const) showToast({ tone, title: tone });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('danger');
    const statuses = screen.getAllByRole('status');
    // Newest on top.
    expect(statuses.map((s) => s.textContent)).toEqual(['warning', 'neutral']);
    for (const toast of [...statuses, screen.getByRole('alert')]) {
      expect(toast.querySelector('.hl-toast-icon svg')).not.toBeNull();
      expect(within(toast).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    }
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hover and focus hold the timer until both have left', () => {
    vi.useFakeTimers();
    renderWithDaemon(<Toaster />);
    act(() => void showToast({ tone: 'success', title: 'Immich is ready' }));
    const toast = screen.getByRole('status').parentElement!;
    const dismiss = within(toast).getByRole('button', { name: 'Dismiss' });
    act(() => vi.advanceTimersByTime(4_000));
    fireEvent.mouseEnter(toast);
    fireEvent.focus(dismiss);
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(10_000));
    expect(titles()).toEqual(['Immich is ready']);
    fireEvent.blur(dismiss);
    act(() => vi.advanceTimersByTime(999));
    expect(titles()).toEqual(['Immich is ready']);
    act(() => vi.advanceTimersByTime(1));
    expect(titles()).toEqual([]);
  });
});
