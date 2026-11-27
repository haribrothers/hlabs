// US-SYS-47 · Some changes only work at home: on the public dashboard (`auth.me.via === 'public'`) every home-only
// control shows, with a house and "At home only", and explains instead of acting ("Do this at home or on your
// tailnet"); HOME_ONLY from the daemon explains the same way; stopping exposure stays a normal control; the banner;
// and Home there (HomePublicAddress): a public app opens at its public address, any other says it opens at home.
import { HOME_ONLY_PROCEDURES, type HomeOnlyProcedure } from '@hlabs/shared';
import { useMutation } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicDashboardCopy } from '../copy/public-dashboard';
import { AppGrid, type HomeApp } from '../home/app-grid';
import { browser } from '../lib/browser';
import { closeAway, closeHomeOnly, explainIfHomeOnly } from './explain';
import { InviteButton } from '../settings/users-section';
import { PublicAccess } from '../settings/public-access';
import { fakeMe } from '../test/me';
import { cloudflareOn, dashboardPublic, publicRow, status } from '../test/public';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { HomeOnly, InternetBanner } from './home-only';
import { Button } from '@hlabs/ui';

const never = () => new Promise(() => {});
const fromInternet = fakeMe({ via: 'public', totpEnabled: true });
const atHome = fakeMe({ via: 'home' });

afterEach(() => {
  vi.restoreAllMocks();
  closeHomeOnly();
  closeAway();
});

const app = (id: string, name: string, extra: Partial<HomeApp> = {}): HomeApp => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
  ...extra,
});
const immich = app('immich', 'Immich', {
  public: {
    address: 'https://photos.example.com',
    hostname: 'photos.example.com',
    access: 'hlabs',
    since: 0,
    by: 'Hari',
  },
});
const vaultwarden = app('vaultwarden', 'Vaultwarden');

function network(me = fromInternet, handlers: Handlers = {}) {
  return renderScreen(
    () => <PublicAccess shippedPhase={7} />,
    {
      'auth.me': me,
      'public.status': () =>
        status(cloudflareOn(), [publicRow()], dashboardPublic({ cloudflareAccess: { emails: ['a@b.co'] } })),
      'events.stream': never,
      ...handlers,
    },
    { path: '/settings/network' },
  );
}

describe('US-SYS-47', () => {
  it('names every home-only change in the explanation', () => {
    for (const p of Object.keys(HOME_ONLY_PROCEDURES) as HomeOnlyProcedure[])
      expect(publicDashboardCopy.homeOnlyWhat[p], p).toMatch(/\S/);
  });

  it('at home a home-only control is itself; from the internet it says "At home only" and explains', async () => {
    const remove = vi.fn();
    const ui = () => (
      <HomeOnly procedure="public.remove" label="Remove…">
        <Button onClick={remove}>Remove…</Button>
      </HomeOnly>
    );
    const home = renderScreen(ui, { 'auth.me': atHome });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove…' }));
    expect(remove).toHaveBeenCalledTimes(1);
    home.unmount();

    renderScreen(ui, { 'auth.me': fromInternet });
    const pill = await screen.findByRole('button', { name: 'Remove, at home only' });
    expect(pill).toHaveTextContent('Remove…At home only');
    expect(pill).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(pill);
    expect(remove).toHaveBeenCalledTimes(1);
    const dialog = await screen.findByRole('alertdialog', { name: 'Do this at home or on your tailnet' });
    expect(dialog).toHaveTextContent(
      "Removing Cloudflare Tunnel only works from hlabs at home or on your tailnet, so someone with your password and code can't do it from the internet.",
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('HOME_ONLY from the daemon opens the same explanation, naming what was refused', async () => {
    function Try() {
      const m = useMutation({
        mutationFn: () => Promise.reject(daemonError('HOME_ONLY', { procedure: 'users.delete' })),
        onError: (err) => void explainIfHomeOnly(err),
      });
      return <Button onClick={() => m.mutate()}>Delete</Button>;
    }
    renderScreen(Try, {});
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Do this at home or on your tailnet' });
    expect(dialog).toHaveTextContent('Deleting a person only works from hlabs at home or on your tailnet');
  });

  it('Settings › Network there: removing the tunnel and changing the sign-in say so; making private still works', async () => {
    network();
    const group = await screen.findByRole('group', { name: 'Public access' });
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'Remove, at home only' })).toBeInTheDocument(),
    );
    expect(within(group).getByRole('button', { name: 'Change, at home only' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Make private: Dashboard' })).not.toHaveTextContent(
      'At home only',
    );
    expect(screen.getByRole('button', { name: 'Make private: Immich' })).not.toHaveTextContent('At home only');
    expect(screen.getByRole('button', { name: /Turn off all public access/ })).not.toHaveTextContent('At home only');
  });

  it('at home the same controls are as usual', async () => {
    network(atHome);
    const group = await screen.findByRole('group', { name: 'Public access' });
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Remove…' })).toBeInTheDocument());
    expect(screen.queryByText('At home only')).toBeNull();
  });

  it('inviting someone shows "At home only" there', async () => {
    renderScreen(InviteButton, { 'auth.me': fromInternet });
    fireEvent.click(await screen.findByRole('button', { name: 'Invite someone, at home only' }));
    expect(await screen.findByRole('alertdialog', { name: 'Do this at home or on your tailnet' })).toHaveTextContent(
      'Inviting someone only works',
    );
  });

  it('the banner says hlabs is used from the internet, only there', async () => {
    const r = renderScreen(() => <InternetBanner variant="home" />, { 'auth.me': fromInternet });
    expect(await screen.findByRole('note')).toHaveTextContent(
      "You're using hlabs from the internet. Some changes only work at home or on your tailnet.",
    );
    r.unmount();
    renderScreen(() => <InternetBanner variant="home" />, { 'auth.me': atHome });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('Home there: a public app opens its public address; another says it opens at home, with Make public for admins', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    renderScreen(() => <AppGrid apps={[immich, vaultwarden]} isAdmin />, { 'auth.me': fromInternet });
    const pub = await screen.findByRole('button', { name: 'Immich, public, opens photos.example.com' });
    expect(pub).toHaveTextContent('photos.example.com');
    fireEvent.click(pub);
    expect(open).toHaveBeenCalledWith('https://photos.example.com');

    const away = screen.getByRole('button', { name: 'Vaultwarden, at home only' });
    expect(away).toHaveTextContent('At home only');
    fireEvent.click(away);
    expect(open).toHaveBeenCalledTimes(1);
    const pop = await screen.findByRole('dialog', { name: 'Vaultwarden opens at home or on your tailnet.' });
    expect(pop).toHaveTextContent("It isn't public, so it can't be reached from the internet.");
    fireEvent.click(within(pop).getByRole('button', { name: 'Make Vaultwarden public, at home only' }));
    expect(await screen.findByRole('alertdialog', { name: 'Do this at home or on your tailnet' })).toHaveTextContent(
      'Making an app public only works',
    );
  });

  it('members see the same tiles without "Make <App> public…"', async () => {
    renderScreen(() => <AppGrid apps={[vaultwarden]} isAdmin={false} />, {
      'auth.me': fakeMe({ via: 'public', role: 'member' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Vaultwarden, at home only' }));
    const pop = await screen.findByRole('dialog', { name: 'Vaultwarden opens at home or on your tailnet.' });
    expect(within(pop).queryByRole('button')).toBeNull();
  });
});
