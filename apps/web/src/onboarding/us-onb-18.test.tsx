import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { DoneStep } from './done-step';
import { RemoteStep } from './remote-step';

const handlers = {
  'system.info': () => ({ hostname: 'hlabs', os: { headless: false } }),
  'onboarding.setStep': () => ({ ok: true }),
  'onboarding.status': () => ({ completed: false, step: 'apps', hasUsers: true }),
};

describe('US-ONB-18', () => {
  it('shows the home network address as Ready and Tailscale as an option', async () => {
    renderScreen(() => <RemoteStep shippedPhase={3} />, handlers, { path: '/setup/remote' });
    expect(await screen.findByRole('heading', { name: 'Reach hlabs from anywhere' })).toBeInTheDocument();
    expect(screen.getByText('Step 5 of 6')).toBeInTheDocument();
    expect(await screen.findByText('https://hlabs.local')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Anywhere, with Tailscale')).toBeInTheDocument();
  });

  it('Set up later saves the apps step and opens it, without any Tailscale call', async () => {
    const { calls, router } = renderScreen(() => <RemoteStep shippedPhase={3} />, handlers, { path: '/setup/remote' });
    fireEvent.click(await screen.findByRole('button', { name: 'Set up later' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/apps'));
    expect(calls.find((c) => c.path === 'onboarding.setStep')?.input).toEqual({ step: 'apps' });
    expect(calls.some((c) => c.path.startsWith('network.') || c.path === 'onboarding.connectRemote')).toBe(false);
  });

  it('Back opens the storage step', async () => {
    const { router } = renderScreen(() => <RemoteStep shippedPhase={3} />, handlers, { path: '/setup/remote' });
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/storage'));
  });

  it('the finish screen says "Remote access · Home network only"', async () => {
    renderScreen(() => <DoneStep shippedPhase={3} />, {
      ...handlers,
      'auth.me': fakeMe(),
      'storage.locations.list': () => ({ locations: [{ id: 'l', isRoot: true, name: 'This computer' }] }),
      'apps.list': () => ({ apps: [] }),
    });
    expect(await screen.findByText('Remote access')).toBeInTheDocument();
    expect(screen.getByText('Home network only')).toBeInTheDocument();
  });
});
