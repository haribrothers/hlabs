import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { DoneStep } from './done-step';
import { firstRunView } from './first-run';
import { StorageStep } from './storage-step';

describe('US-ONB-22', () => {
  it('Open dashboard goes Home', async () => {
    const { router } = renderScreen(DoneStep, {
      'auth.me': () => ({ displayName: 'Hari', username: 'hari', totpEnabled: true, csrfToken: 'c' }),
      'system.info': () => ({ os: { headless: false } }),
      'storage.locations.list': () => ({ locations: [] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Open dashboard' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('when completing finds a step missing, it goes back to that step', async () => {
    const { router } = renderScreen(StorageStep, {
      'onboarding.checkSystem': () => ({ disk: { freeBytes: 142e9, path: '/Users/hari/hlabs', level: 'ok' } }),
      'onboarding.setStorage': () => ({ ok: true }),
      'onboarding.status': () => ({ completed: false, step: 'done', hasUsers: true }),
      'onboarding.complete': () => Promise.reject(daemonError('ONBOARDING_INCOMPLETE', { missing: 'account' })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/account'));
  });

  it('reloading the finish screen after completion goes Home', () => {
    const status = { completed: true, step: 'done' as const };
    expect(
      firstRunView({ pathname: '/setup/done', status, failed: false, dev: false, hasSetupToken: false, entry: true }),
    ).toEqual({ kind: 'redirect', to: '/' });
  });
});
