// US-SYS-24 · Check for updates now.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { daemonError, renderScreen } from '../test/render';
import { UpdatesSection } from './updates-section';

const status = (extra: Record<string, unknown> = {}) => ({
  version: '1.4.0',
  channel: 'stable',
  autoHlabs: true,
  autoApps: false,
  backupBeforeUpdate: true,
  lastCheckedAt: Date.now() - 2.5 * 3_600_000,
  available: null,
  ...extra,
});
const later = <T,>(value: T, ms = 50) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-SYS-24', () => {
  it('up to date: the version and when it last checked', async () => {
    renderScreen(UpdatesSection, { 'settings.updates.get': () => status() });
    expect(await screen.findByRole('heading', { name: 'hlabs is up to date' })).toBeInTheDocument();
    expect(screen.getByText('Version 1.4.0')).toBeInTheDocument();
    expect(screen.getByText('Last checked 2 hours ago')).toBeInTheDocument();
  });

  it('Check now shows a spinner, then the result and "Last checked just now"; the store updates are fetched again', async () => {
    const check = vi.fn(() =>
      later(
        status({ lastCheckedAt: Date.now(), available: { version: '1.5.0', notes: ['Faster installs'], url: 'u' } }),
      ),
    );
    const { calls } = renderScreen(UpdatesSection, {
      'settings.updates.get': () => status(),
      'settings.updates.check': check as never,
      'store.listUpdates': () => ({ updates: [] }),
    });
    const button = await screen.findByRole('button', { name: 'Check now' });
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Checking…' })).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('heading', { name: 'hlabs 1.5.0 is available' })).toBeInTheDocument();
    expect(screen.getByText('You have 1.4.0. Apps restart for about a minute.')).toBeInTheDocument();
    expect(screen.getByText('Faster installs')).toBeInTheDocument();
    expect(screen.getByText('Last checked just now')).toBeInTheDocument();
    expect(check).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.path)).toContain('settings.updates.check');
  });

  it('offline: a toast says so and the previous result stays', async () => {
    renderScreen(UpdatesSection, {
      'settings.updates.get': () => status(),
      'settings.updates.check': () => Promise.reject(daemonError('UPDATE_CHECK_FAILED')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Check now' }));
    await waitFor(() =>
      expect(currentToasts().map((t) => `${t.title}. ${t.body}`)).toEqual([
        "Couldn't check for updates. Check your internet connection.",
      ]),
    );
    expect(screen.getByRole('heading', { name: 'hlabs is up to date' })).toBeInTheDocument();
    expect(screen.getByText('Last checked 2 hours ago')).toBeInTheDocument();
  });
});
