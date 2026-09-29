import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { firstRunView } from './first-run';
import { StorageStep, tildePath } from './storage-step';

const check = () => ({ disk: { freeBytes: 142e9, path: '/Users/hari/hlabs', level: 'ok' } });

describe('US-ONB-14', () => {
  it('shortens the home folder to ~', () => {
    expect(tildePath('/Users/hari/hlabs')).toBe('~/hlabs');
    expect(tildePath('/home/hari/hlabs')).toBe('~/hlabs');
    expect(tildePath('/var/lib/hlabs/storage')).toBe('/var/lib/hlabs/storage');
  });

  it('offers three locations with This computer chosen, its path, free space and Fastest, and the note', async () => {
    renderScreen(StorageStep, { 'onboarding.checkSystem': check });
    expect(await screen.findByRole('heading', { level: 1, name: 'Where should your data live?' })).toBeInTheDocument();
    expect(
      screen.getByText('Home folders, shared files and media go here. You can move them later in Settings.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Storage location' })).toBeInTheDocument();
    const local = screen.getByRole('radio', { name: /This computer/ });
    expect(local).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('~/hlabs · 142 GB free')).toBeInTheDocument();
    expect(screen.getByText('Fastest')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /External drive/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Network storage \(NAS\)/ })).toBeInTheDocument();
    expect(
      screen.getByText('App databases always stay on this computer for speed. Media libraries can point anywhere.'),
    ).toBeInTheDocument();
  });

  it('in phase 1 Continue saves the choice, completes onboarding and opens the finish screen', async () => {
    const setStorage = vi.fn(() => ({ ok: true }));
    const complete = vi.fn(() => ({ redirectTo: '/' }));
    const { router } = renderScreen(StorageStep, {
      'onboarding.checkSystem': check,
      'onboarding.setStorage': setStorage,
      'onboarding.status': () => ({ completed: false, step: 'done', hasUsers: true }),
      'onboarding.complete': complete,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/done'));
    expect(setStorage).toHaveBeenCalledWith({ kind: 'local' });
    expect(complete).toHaveBeenCalled();
  });

  it('when a later step is enabled, Continue opens it without completing', async () => {
    const complete = vi.fn();
    const { router } = renderScreen(StorageStep, {
      'onboarding.checkSystem': check,
      'onboarding.setStorage': () => ({ ok: true }),
      'onboarding.status': () => ({ completed: false, step: 'remote', hasUsers: true }),
      'onboarding.complete': complete,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/remote'));
    expect(complete).not.toHaveBeenCalled();
  });

  it('a folder hlabs cannot write to shows on the row', async () => {
    renderScreen(StorageStep, {
      'onboarding.checkSystem': check,
      'onboarding.setStorage': () => Promise.reject(daemonError('STORAGE_NOT_WRITABLE')),
    });
    await screen.findByText('~/hlabs · 142 GB free');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const row = screen.getByRole('radio', { name: /This computer/ });
    await waitFor(() => expect(row).toHaveTextContent("hlabs can't write to ~/hlabs"));
  });

  it('Back opens two-factor', async () => {
    const { router } = renderScreen(StorageStep, { 'onboarding.checkSystem': check });
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/twoFactor'));
  });

  it('keeps the finish screen up after completing in this tab, but a fresh load goes home', () => {
    const status = { completed: true, step: 'done' as const };
    const opts = { pathname: '/setup/done', status, failed: false, dev: false, hasSetupToken: true };
    expect(firstRunView(opts)).toEqual({ kind: 'setup' });
    expect(firstRunView({ ...opts, entry: true })).toEqual({ kind: 'redirect', to: '/' });
  });
});
