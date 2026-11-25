// US-SYS-44 · See and stop everything that's public: the Public apps list (name, address, who can get in, since when
// and by whom, Visits and Make private), "No apps are public.", and "Turn off all public access" in one job. The
// menu-bar app's part is in apps/tray/test/us-sys-44.test.tsx.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeDns } from '../test/network';
import { cloudflareOn, jellyfinRow, job, publicRow, status } from '../test/public';
import { renderScreen, type Handlers } from '../test/render';
import { NetworkSection } from './network-section';
import { PublicAccess } from './public-access';

const never = () => new Promise(() => {});
afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

function open(handlers: Handlers = {}) {
  return renderScreen(
    () => <PublicAccess />,
    {
      'public.status': () => status(cloudflareOn(), [publicRow(), jellyfinRow()]),
      'events.stream': never,
      ...handlers,
    },
    { path: '/settings/network', routes: { '/': () => <p>home</p> } },
  );
}

describe('US-SYS-44', () => {
  it('lists each public app: name, address, who can get in, since when and by whom, Visits and Make private', async () => {
    open();
    const list = await screen.findByRole('group', { name: 'Public apps' });
    const immich = within(list).getByText('Immich').closest('.hl-list-row') as HTMLElement;
    expect(within(immich).getByText('Public')).toBeInTheDocument();
    expect(within(immich).getByText('https://photos.example.com')).toBeInTheDocument();
    expect(within(immich).getByText(/hlabs login with two-factor · since (3 Dec|Dec 3) by Hari/)).toBeInTheDocument();
    expect(within(immich).getByRole('button', { name: 'Visits: Immich' })).toBeInTheDocument();
    expect(within(immich).getByRole('button', { name: 'Make private: Immich' })).toBeInTheDocument();
    const jellyfin = within(list).getByText('Jellyfin').closest('.hl-list-row') as HTMLElement;
    expect(within(jellyfin).getByText(/Jellyfin's own login · since (1 Dec|Dec 1) by Asha/)).toBeInTheDocument();
    expect(screen.getByText('Makes every app private. Cloudflare Tunnel stays set up.')).toBeInTheDocument();
  });

  it('nothing public: "No apps are public." and no Turn off all', async () => {
    open({ 'public.status': () => status(cloudflareOn(), []) });
    const list = await screen.findByRole('group', { name: 'Public apps' });
    expect(within(list).getByText('No apps are public.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn off all public access/ })).toBeNull();
  });

  it('"Turn off all public access" lists the apps, says who is told, and makes them all private in one job', async () => {
    const { calls } = open({
      'public.turnOffAll': () => ({ jobId: 'job3' }),
      'jobs.get': () => job({ id: 'job3', kind: 'public_off_all', target: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Turn off all public access/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Turn off all public access?' });
    expect(dialog).toHaveTextContent(
      'These apps stop answering on the internet within seconds. Cloudflare Tunnel stays set up, so you can make apps public again later.',
    );
    expect(within(dialog).getByText('https://photos.example.com')).toBeInTheDocument();
    expect(within(dialog).getByText('https://jellyfin.example.com')).toBeInTheDocument();
    expect(
      within(dialog).getByText('The other admins get a notification, and the audit log records it.'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off public access' }));
    await waitFor(() => expect(calls.filter((c) => c.path === 'public.turnOffAll')).toHaveLength(1));
    await waitFor(() => expect(currentToasts().some((t) => t.title === 'Public access is off')).toBe(true));
    expect(calls.some((c) => c.path === 'apps.setPublic')).toBe(false);
  });

  it('Make private asks first, naming the app and its address', async () => {
    const { calls } = open({
      'apps.setPublic': () => ({ jobId: 'job4' }),
      'jobs.get': () => job({ id: 'job4', kind: 'public_off' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Make private: Immich' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Make Immich private?' });
    expect(dialog).toHaveTextContent(
      'https://photos.example.com stops answering within seconds. Immich stays as it is at home and on your tailnet.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make private' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setPublic')?.input).toEqual({ appId: 'immich', public: false }),
    );
    await waitFor(() => expect(currentToasts().some((t) => t.title === 'Immich is private')).toBe(true));
  });

  it("Visits opens the app's Visits over the page", async () => {
    const { router } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Visits: Immich' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ settings: 'immich', view: 'visits' }));
  });

  it('is in Settings › Network from phase 7, under Remote access (D-036)', async () => {
    const handlers: Handlers = {
      'network.status': () => ({
        home: {
          localAddress: 'https://hlabs.local',
          dnsAddress: 'https://hlabs.home.arpa',
          published: true,
          fallbackAddress: null,
          lanAddresses: [],
        },
        remote: {
          mode: 'off',
          state: 'off',
          tailnet: null,
          nodeName: null,
          url: null,
          loginUrl: null,
          keyExpiry: null,
        },
        dns: fakeDns(),
        ports: { https: 443, http: 80 },
      }),
      'apps.list': () => ({ apps: [] }),
      'public.status': () => status(cloudflareOn(), []),
      'events.stream': never,
    };
    const { unmount } = renderScreen(() => <NetworkSection shippedPhase={7} />, handlers);
    expect(await screen.findByRole('group', { name: 'Public access' })).toBeInTheDocument();
    expect(screen.getByText('No apps are public.')).toBeInTheDocument();
    unmount();
    renderScreen(() => <NetworkSection shippedPhase={6} />, handlers);
    await screen.findByRole('group', { name: 'Home network' });
    expect(screen.queryByRole('group', { name: 'Public access' })).toBeNull();
  });
});
