// US-APP-06 · Behaviour switches.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppBehaviour } from './app-behaviour';
import { AppSettings } from './app-settings';

const never = () => new Promise(() => {});
const kuma = (over: Partial<Parameters<typeof appDetail>[0]> = {}) =>
  appDetail({ id: 'uptime-kuma', name: 'Uptime Kuma', state: 'running', autostart: true, ...over });

function openSettings(handlers: Handlers = {}) {
  const app = kuma();
  return renderScreen(
    () => <AppSettings appId="uptime-kuma" />,
    { 'apps.get': () => ({ ...app }), 'events.stream': never, 'auth.me': fakeMe({ role: 'admin' }), ...handlers },
    { path: '/apps/uptime-kuma/settings' },
  );
}

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-APP-06', () => {
  it('Behaviour shows "Start automatically" with its saved value; later phases\' switches are hidden', async () => {
    openSettings();
    const behaviour = await screen.findByRole('group', { name: 'Behaviour' });
    expect(within(behaviour).getByRole('switch', { name: 'Start automatically' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(behaviour).queryByRole('switch', { name: 'Include in backups' })).toBeNull();
    expect(within(behaviour).queryByRole('switch', { name: 'Update automatically' })).toBeNull();
  });

  it('toggling "Start automatically" saves at once (optimistic)', async () => {
    const { calls } = openSettings({ 'apps.setAutostart': () => new Promise(() => {}) });
    const toggle = await screen.findByRole('switch', { name: 'Start automatically' });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    await waitFor(() =>
      expect(calls).toContainEqual({ path: 'apps.setAutostart', input: { appId: 'uptime-kuma', enabled: false } }),
    );
  });

  it('when saving fails, it flips back and a toast says why', async () => {
    openSettings({ 'apps.setAutostart': () => Promise.reject(daemonError('APP_BUSY', { appId: 'uptime-kuma' })) });
    const toggle = await screen.findByRole('switch', { name: 'Start automatically' });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(currentToasts()).toContainEqual(expect.objectContaining({ tone: 'danger' })));
  });

  it('"Update automatically" shows once phase 7 ships', async () => {
    renderScreen(() => <AppBehaviour app={kuma({ autoUpdate: true })} shippedPhase={7} />, {});
    expect(await screen.findByRole('switch', { name: 'Update automatically' })).toHaveAttribute('aria-checked', 'true');
  });

  it('a custom app\'s "Update automatically" is off with "Custom apps never update automatically"', async () => {
    renderScreen(() => <AppBehaviour app={kuma({ custom: true })} shippedPhase={7} />, {});
    expect(await screen.findByRole('switch', { name: 'Update automatically' })).toBeDisabled();
    expect(screen.getByText('Custom apps never update automatically')).toBeInTheDocument();
  });
});
