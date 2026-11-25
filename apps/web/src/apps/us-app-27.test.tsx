// US-APP-27 · Make an app public: the Access section's "Public on the internet" (Make public…, set up first, or why
// it can't), the AppPublic dialog (the name under the domain, the media note, a name already in the DNS), the Public
// badge (App settings, Home tile, Dock), Make private, and automatic updates "On while <App> is public".
import { AppIcon } from '@hlabs/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { actionsFromNotification, runToastMutation } from '../lib/toast-actions';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { appPublic, job, publicOptions } from '../test/public';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppAccess } from './app-access';
import { AppBehaviour } from './app-behaviour';
import { AppSettings } from './app-settings';

const never = () => new Promise(() => {});
const immich = (over: Parameters<typeof appDetail>[0] = {}) =>
  appDetail({ id: 'immich', name: 'Immich', state: 'running', ...over });

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

function access(app = immich(), handlers: Handlers = {}, shippedPhase = 7) {
  return renderScreen(() => <AppAccess app={app} shippedPhase={shippedPhase} />, {
    'apps.get': () => app,
    'apps.publicOptions': () => publicOptions(),
    'auth.me': fakeMe({ role: 'admin' }),
    'events.stream': never,
    ...handlers,
  });
}

const group = () => screen.findByRole('group', { name: 'Access' });

describe('US-APP-27', () => {
  it('once public access is set up, Access offers "Make public…"', async () => {
    access();
    const g = await group();
    expect(await within(g).findByText('Public on the internet')).toBeInTheDocument();
    expect(within(g).getByText('Not public. Only your home network and tailnet can open Immich.')).toBeInTheDocument();
    expect(within(g).getByRole('button', { name: 'Make public…' })).toBeInTheDocument();
  });

  it('without it: "Set up public access in Settings › Network first" with a link there', async () => {
    access(immich(), { 'apps.publicOptions': () => publicOptions({ domain: null }) });
    const g = await group();
    expect(await within(g).findByText('Set up public access in Settings › Network first.')).toBeInTheDocument();
    expect(within(g).getByRole('link', { name: 'Open Network settings' })).toHaveAttribute('href', '/settings/network');
    expect(within(g).queryByRole('button', { name: 'Make public…' })).toBeNull();
  });

  it("public.allowed: false replaces the button with why (or the manifest's reason)", async () => {
    const portainer = immich({ id: 'portainer', name: 'Portainer' });
    access(portainer, { 'apps.publicOptions': () => publicOptions({ allowed: false }) });
    const g = await group();
    expect(
      await within(g).findByText("Portainer can't be made public: it can control your other apps."),
    ).toBeInTheDocument();
    expect(within(g).getByText('Never public')).toBeInTheDocument();
    expect(within(g).queryByRole('button', { name: 'Make public…' })).toBeNull();
  });

  it('a manifest reason is said as written', async () => {
    access(immich(), {
      'apps.publicOptions': () => publicOptions({ allowed: false, reason: 'it holds every password you have.' }),
    });
    expect(
      await screen.findByText("Immich can't be made public: it holds every password you have."),
    ).toBeInTheDocument();
  });

  it('AppPublic: the address under the domain, suggested from the name, the login note, Make public and Cancel', async () => {
    const { calls } = access(immich(), {
      'apps.setPublic': () => ({ jobId: 'job1' }),
      'jobs.get': () => job({ id: 'job1' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make Immich public' });
    const name = within(dialog).getByRole('textbox', { name: 'Name under example.com' });
    expect(name).toHaveValue('immich');
    expect(within(dialog).getByText('.example.com')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "A name of its own under example.com. hlabs adds it to the domain's DNS and takes it out again when Immich is private.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Anyone on the internet can reach this address. hlabs asks for a login first.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Automatic updates stay on while Immich is public.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).queryByText(/Cloudflare's terms/)).toBeNull();
    fireEvent.change(name, { target: { value: 'photos' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make public' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setPublic')?.input).toEqual({
        appId: 'immich',
        public: true,
        hostname: 'photos',
        access: 'hlabs',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(currentToasts().some((t) => t.title === 'Immich is public')).toBe(true);
  });

  it("a media app adds Cloudflare's terms on streaming video", async () => {
    access(immich({ id: 'jellyfin', name: 'Jellyfin' }), {
      'apps.publicOptions': () => publicOptions({ media: true, suggestedLabel: 'jellyfin' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make Jellyfin public' });
    expect(
      within(dialog).getByText(
        "Cloudflare's terms limit streaming large amounts of video through its network. Check them before sharing a media library.",
      ),
    ).toBeInTheDocument();
  });

  it("a name already in the domain's DNS is said at the field", async () => {
    access(immich(), {
      'apps.setPublic': () => {
        throw daemonError('PUBLIC_HOSTNAME_TAKEN', { hostname: 'www.example.com' });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make Immich public' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'www' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make public' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "www.example.com is already in your domain's DNS. Choose another name.",
    );
    expect(within(dialog).getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it("a name that isn't one label is refused before asking hlabs", async () => {
    const { calls } = access();
    fireEvent.click(await screen.findByRole('button', { name: 'Make public…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make Immich public' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'my.photos' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make public' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/lowercase letters, numbers and hyphens/);
    expect(calls.some((c) => c.path === 'apps.setPublic')).toBe(false);
  });

  it('while public: the badge, its address, who can get in, since when and by whom, Visits, Change… and Make private', async () => {
    const pub = immich({ public: appPublic() });
    const { calls } = access(pub, {
      'apps.publicOptions': () => publicOptions({ current: appPublic() }),
      'apps.setPublic': () => ({ jobId: 'job2' }),
      'jobs.get': () => job({ id: 'job2', kind: 'public_off' }),
    });
    const g = await group();
    const row = (await within(g).findByText('Public on the internet')).closest('.hl-list-row') as HTMLElement;
    expect(within(row).getByText('Public')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'https://photos.example.com' })).toHaveAttribute(
      'href',
      'https://photos.example.com',
    );
    expect(
      within(row).getByText(/^Cloudflare Tunnel · hlabs login with two-factor · since (3 Dec|Dec 3) by Hari$/),
    ).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Visits' })).toBeInTheDocument();
    expect(await within(row).findByRole('button', { name: 'Change…' })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Make private' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Make Immich private?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Make private' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setPublic')?.input).toEqual({ appId: 'immich', public: false }),
    );
  });

  it('automatic updates are on while public, and their switch reads "On while Immich is public"', async () => {
    renderScreen(() => <AppBehaviour app={immich({ public: appPublic(), autoUpdate: true })} shippedPhase={7} />, {});
    const toggle = await screen.findByRole('switch', { name: 'Update automatically' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toBeDisabled();
    expect(screen.getByText('On while Immich is public')).toBeInTheDocument();
  });

  it('App settings shows the Public badge by the name', async () => {
    const app = immich({ public: appPublic() });
    renderScreen(() => <AppSettings appId="immich" />, {
      'apps.get': () => app,
      'auth.me': fakeMe({ role: 'admin' }),
      'events.stream': never,
    });
    const heading = await screen.findByRole('heading', { level: 1, name: 'Immich' });
    expect(within(heading.parentElement!).getByText('Public')).toBeInTheDocument();
  });

  it('the Home tile and the Dock say Public, in words and in their names', () => {
    render(<AppIcon name="Immich" ariaLabel="Open Immich" publicLabel="Public" />);
    expect(screen.getByRole('button', { name: 'Open Immich, public' })).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('is hidden until its phase ships (D-036)', async () => {
    access(immich(), {}, 6);
    await group();
    expect(screen.queryByText('Public on the internet')).toBeNull();
  });

  it('"Make private" on the attack notification runs from a toast, and only ever makes private', async () => {
    const [mutation, navigate] = actionsFromNotification([
      {
        kind: 'mutation',
        procedure: 'apps.setPublic',
        input: { appId: 'immich', public: false },
        label: 'Make private',
      },
      { kind: 'navigate', to: '/apps/immich/settings', params: { view: 'visits' } },
    ]);
    expect(mutation).toMatchObject({ kind: 'mutation', label: 'Make private', procedure: 'apps.setPublic' });
    expect(navigate).toMatchObject({ kind: 'navigate', to: '/apps/immich/settings?view=visits', label: 'See visits' });
    const sent: unknown[] = [];
    const client = { apps: { setPublic: { mutate: (input: unknown) => (sent.push(input), { jobId: 'j' }) } } };
    await runToastMutation(client as never, 'apps.setPublic', { appId: 'immich', public: true });
    expect(sent).toEqual([{ appId: 'immich', public: false }]);
  });
});
