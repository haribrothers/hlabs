// US-ONB-19 · Pick starter apps (OnbApps), on phase 2 (the shipped phase in tests is 1, so it's passed in, D-092).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen, type Handlers } from '../test/render';
import { storeApp } from '../test/store';
import { AppsStep } from './apps-step';
import { DoneStep } from './done-step';

const STARTERS: Array<[string, string]> = [
  ['jellyfin', 'Jellyfin'],
  ['immich', 'Immich'],
  ['nextcloud', 'Nextcloud'],
  ['home-assistant', 'Home Assistant'],
  ['vaultwarden', 'Vaultwarden'],
  ['paperless-ngx', 'Paperless'],
  ['uptime-kuma', 'Uptime Kuma'],
  ['open-webui', 'Open WebUI'],
];
const starterApps = (needsMore: string[] = []) => ({
  apps: STARTERS.map(([id, name]) => ({
    app: storeApp(id, name),
    memoryBytes: 1024 * 2 ** 20,
    needsMoreMemory: needsMore.includes(id),
  })),
});

function open(handlers: Handlers = {}) {
  return renderScreen(() => <AppsStep shippedPhase={2} />, {
    'onboarding.starterApps': () => starterApps(),
    ...handlers,
  });
}
const tiles = async () =>
  within(await screen.findByRole('list', { name: 'Starter apps' })).findAllByRole('button', {}, { timeout: 5_000 });

describe('US-ONB-19', () => {
  it('shows Step 5 of 5, the heading and lead, and eight tiles with none picked', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Pick a few apps to start' })).toHaveFocus();
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
    expect(
      screen.getByText("They'll install in the background. Hundreds more are in the App Store."),
    ).toBeInTheDocument();
    const all = await tiles();
    expect(all.map((t) => t.getAttribute('aria-pressed') !== null && t)).toHaveLength(8);
    STARTERS.forEach(([, name], i) => expect(all[i]).toHaveAccessibleName(name));
    for (const t of all) expect(t).toHaveAttribute('aria-pressed', 'false');
  });

  it('a tile toggles when clicked (Space and Enter press it, as any button); nothing picked disables Install', async () => {
    open();
    const install = await screen.findByRole('button', { name: /^Install and finish/ });
    expect(install).toBeDisabled();
    const [jellyfin, immich] = await tiles();
    fireEvent.click(jellyfin!);
    expect(jellyfin).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(immich!);
    expect(screen.getByText('2 apps selected')).toBeInTheDocument();
    expect(install).toBeEnabled();
    // The count shows on the button.
    expect(within(install).getByText('2')).toHaveClass('hl-badge');
    fireEvent.click(jellyfin!);
    expect(jellyfin).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1 app selected')).toBeInTheDocument();
  });

  it('an app that needs more memory than the engine has free says so and can still be picked', async () => {
    open({ 'onboarding.starterApps': () => starterApps(['immich']) });
    const immich = (await tiles())[1]!;
    expect(within(immich).getByText('Needs more memory')).toBeInTheDocument();
    fireEvent.click(immich);
    expect(immich).toHaveAttribute('aria-pressed', 'true');
  });

  it('Install and finish installs them in the grid order, completes onboarding and opens the finish screen', async () => {
    const install = vi.fn(() => ({ jobIds: ['j1', 'j2'] }));
    const complete = vi.fn(() => ({ redirectTo: '/' }));
    const { router } = open({
      'onboarding.installStarterApps': install,
      'onboarding.complete': complete,
      'onboarding.status': () => ({ completed: true, step: 'done', hasUsers: true }),
    });
    const all = await tiles();
    fireEvent.click(all[4]!); // Vaultwarden
    fireEvent.click(all[0]!); // Jellyfin
    fireEvent.click(screen.getByRole('button', { name: /^Install and finish/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/done'));
    expect(install).toHaveBeenCalledWith({ appIds: ['jellyfin', 'vaultwarden'] });
    expect(complete).toHaveBeenCalled();
  });

  it("if the installs can't start it says what to do and stays", async () => {
    const { router } = open({
      'onboarding.installStarterApps': () => {
        throw new Error('down');
      },
    });
    fireEvent.click((await tiles())[0]!);
    fireEvent.click(screen.getByRole('button', { name: /^Install and finish/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't start installing these apps. Try again, or skip and install them from the App Store.",
    );
    expect(router.state.location.pathname).toBe('/');
  });

  it('the finish screen lists the apps installing', async () => {
    renderScreen(() => <DoneStep shippedPhase={2} />, {
      'auth.me': () => ({ displayName: 'Hari', username: 'hari', totpEnabled: true, csrfToken: 'c' }),
      'system.info': () => ({
        hostname: 'hlabs',
        os: { platform: 'darwin', release: '25', arch: 'arm64', headless: false },
      }),
      'storage.locations.list': () => ({ locations: [] }),
      'apps.list': () => ({
        apps: [
          { id: 'jellyfin', name: 'Jellyfin', state: 'installing' },
          { id: 'immich', name: 'Immich', state: 'installing' },
          { id: 'vaultwarden', name: 'Vaultwarden', state: 'installing' },
        ],
      }),
    });
    const summary = await screen.findByRole('group', { name: 'What was set up' });
    expect(await within(summary).findByText('Installing 3 apps')).toBeInTheDocument();
    expect(within(summary).getByText('Jellyfin, Immich, Vaultwarden')).toBeInTheDocument();
    expect(screen.getByText('Your apps are installing. hlabs keeps running from the menu bar.')).toBeInTheDocument();
  });
});
