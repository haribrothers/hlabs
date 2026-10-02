// US-ONB-20 · Skip starter apps, on phase 2 (passed in, D-092).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { storeApp } from '../test/store';
import { AppsStep } from './apps-step';
import { DoneStep } from './done-step';

const handlers = {
  'onboarding.starterApps': () => ({
    apps: [{ app: storeApp('jellyfin', 'Jellyfin'), memoryBytes: null, needsMoreMemory: false }],
  }),
  'onboarding.status': () => ({ completed: true, step: 'done', hasUsers: true }),
};

describe('US-ONB-20', () => {
  it('Skip installs nothing, completes onboarding and opens the finish screen', async () => {
    const install = vi.fn();
    const complete = vi.fn(() => ({ redirectTo: '/' }));
    const { router } = renderScreen(() => <AppsStep shippedPhase={2} />, {
      ...handlers,
      'onboarding.installStarterApps': install,
      'onboarding.complete': complete,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Jellyfin' }, { timeout: 5_000 }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/done'));
    expect(complete).toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it('the finish screen has no Installing row when nothing was picked', async () => {
    renderScreen(() => <DoneStep shippedPhase={2} />, {
      'auth.me': () => ({ displayName: 'Hari', username: 'hari', totpEnabled: true, csrfToken: 'c' }),
      'system.info': () => ({
        hostname: 'hlabs',
        os: { platform: 'darwin', release: '25', arch: 'arm64', headless: false },
      }),
      'storage.locations.list': () => ({ locations: [] }),
      'apps.list': () => ({ apps: [] }),
    });
    const summary = await screen.findByRole('group', { name: 'What was set up' });
    await within(summary).findByText('hari · 2FA on');
    expect(within(summary).queryByText(/Installing/)).toBeNull();
    expect(screen.getByText('hlabs keeps running from the menu bar.')).toBeInTheDocument();
  });

  it('Back opens the step before (storage, until remote access ships in phase 3)', async () => {
    const { router } = renderScreen(() => <AppsStep shippedPhase={2} />, handlers);
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/storage'));
  });

  it('Back opens remote access once it ships', async () => {
    const { router } = renderScreen(() => <AppsStep shippedPhase={3} />, handlers);
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/remote'));
  });
});
