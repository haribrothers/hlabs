// US-APP-19 · Require hlabs login in front of an app: the Access section's switch ("Adds your hlabs sign-in in front
// of the app"), on unless the app's manifest says otherwise; turning it off asks first and then saves at once;
// "Uses its own login too" for an app with its own accounts, in Access and on the Permissions tab.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { appConfig, renderPermissions, vaultwarden } from '../test/app-config';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { AppAccess } from './app-access';

function access(app = vaultwarden(), shippedPhase = 7) {
  return renderScreen(() => <AppAccess app={app} shippedPhase={shippedPhase} />, {
    'apps.setAuthMode': () => ({ ok: true }),
    'apps.get': () => app,
    'auth.me': fakeMe({ role: 'admin' }),
  });
}

const toggle = () => screen.getByRole('switch', { name: 'Require hlabs login' });

describe('US-APP-19', () => {
  it('Access has "Require hlabs login", on by default, with what it does and "Uses its own login too"', async () => {
    access();
    const group = await screen.findByRole('group', { name: 'Access' });
    expect(within(group).getByRole('switch', { name: 'Require hlabs login' })).toHaveAttribute('aria-checked', 'true');
    expect(
      within(group).getByText('Adds your hlabs sign-in in front of the app · Uses its own login too'),
    ).toBeInTheDocument();
  });

  it('an app without its own login says only what the switch does', async () => {
    access(vaultwarden({ ownLogin: false }));
    expect(await screen.findByText('Adds your hlabs sign-in in front of the app')).toBeInTheDocument();
  });

  it('is off for an app whose manifest says web.auth: none', async () => {
    access(vaultwarden({ authMode: 'none' }));
    await screen.findByRole('group', { name: 'Access' });
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('turning it off asks first; Cancel changes nothing', async () => {
    const { calls } = access();
    await screen.findByRole('group', { name: 'Access' });
    fireEvent.click(toggle());
    const dialog = await screen.findByRole('dialog', { name: 'Turn off hlabs login for Vaultwarden?' });
    expect(dialog).toHaveTextContent(
      "Anyone who can reach https://vaultwarden.hlabs.local will see Vaultwarden's own sign-in page. Members without access to it in hlabs will no longer be blocked.",
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(calls.some((c) => c.path === 'apps.setAuthMode')).toBe(false);
  });

  it('"Turn off" saves at once', async () => {
    const { calls } = access();
    await screen.findByRole('group', { name: 'Access' });
    fireEvent.click(toggle());
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Turn off' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setAuthMode')?.input).toEqual({ appId: 'vaultwarden', mode: 'none' }),
    );
  });

  it('turning it on saves at once, without asking', async () => {
    const { calls } = access(vaultwarden({ authMode: 'none' }));
    await screen.findByRole('group', { name: 'Access' });
    fireEvent.click(toggle());
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setAuthMode')?.input).toEqual({ appId: 'vaultwarden', mode: 'hlabs' }),
    );
  });

  it('is hidden until its phase ships (D-036)', async () => {
    access(vaultwarden(), 6);
    await screen.findByRole('group', { name: 'Access' });
    expect(screen.queryByRole('switch', { name: 'Require hlabs login' })).toBeNull();
  });

  it('the Permissions tab says "Uses its own login too" too', async () => {
    renderPermissions({}, appConfig({ auth: { mode: 'hlabs', ownLogin: true } }));
    expect(await screen.findByText('Uses its own login too')).toBeInTheDocument();
  });
});
