import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../shell/toaster';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { portsLine } from './network-section';
import { SectionPage } from './section-page';

const writeText = vi.fn(async () => undefined);
beforeEach(() => Object.assign(navigator, { clipboard: { writeText } }));

const app = (id: string, name: string, local = `https://${id}.hlabs.local`) => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local, tailnet: null },
});
const home = (o: Record<string, unknown> = {}) => ({
  hostname: 'hlabs',
  localAddress: 'https://hlabs.local',
  dnsAddress: 'https://hlabs.home.arpa',
  published: true,
  lanAddresses: ['192.168.1.20'],
  fallbackAddress: null,
  ...o,
});

function open(o: { home?: Record<string, unknown>; apps?: unknown[]; role?: 'admin' | 'member' } = {}) {
  return renderScreen(
    () => (
      <>
        <SectionPage id="network" shippedPhase={3} />
        <Toaster />
      </>
    ),
    {
      'auth.me': fakeMe({ role: o.role ?? 'admin' }),
      'network.status': () => ({ home: home(o.home), ports: { https: 443, http: 80 } }),
      'apps.list': () => ({
        apps: o.apps ?? [app('jellyfin', 'Jellyfin'), app('immich', 'Immich', 'https://hlabs.local:12001')],
      }),
      'events.stream': () => new Promise(() => {}),
    },
  );
}

describe('US-SYS-01', () => {
  it('Home network: the local address (and its DNS name), HTTPS, and web ports; Rename and Get certificate wait for phase 9', async () => {
    open();
    const group = await screen.findByRole('group', { name: 'Home network' });
    expect(within(group).getByText('hlabs.local')).toBeInTheDocument();
    expect(within(group).getByText('hlabs.home.arpa · for devices that use your DNS server')).toBeInTheDocument();
    expect(
      within(group).getByText('Install the hlabs certificate once on each device to remove browser warnings'),
    ).toBeInTheDocument();
    expect(within(group).getByText('HTTP 80 · HTTPS 443')).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(within(group).queryByRole('button', { name: 'Get certificate' })).toBeNull();
  });

  it('App addresses: every app by name with its address, opening in a new tab, and Copy', async () => {
    open();
    const list = await screen.findByRole('group', { name: 'App addresses' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['https://hlabs.local:12001', 'https://jellyfin.hlabs.local']);
    expect(links[1]).toHaveAttribute('target', '_blank');
    fireEvent.click(within(list).getAllByRole('button', { name: /Copy/ })[1]!);
    expect(writeText).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
    expect(await screen.findByText('Address copied')).toBeInTheDocument();
  });

  it('with no apps: "No apps yet" and the App Store', async () => {
    open({ apps: [] });
    expect(await screen.findByText('No apps yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the App Store' })).toHaveAttribute('href', '/store');
  });

  it('a name that is not published: "Not published", the LAN address to use, and every LAN address', async () => {
    open({
      home: { published: false, fallbackAddress: 'https://192.168.1.20', lanAddresses: ['192.168.1.20', '10.0.0.5'] },
    });
    expect(await screen.findByText('Not published')).toBeInTheDocument();
    expect(screen.getByText('Use https://192.168.1.20 until the name is published')).toBeInTheDocument();
    expect(screen.getByText('This computer on your network: 192.168.1.20, 10.0.0.5')).toBeInTheDocument();
  });

  it('a member opening it sees "You don\'t have access to this"', async () => {
    open({ role: 'member' });
    expect(await screen.findByRole('heading', { name: "You don't have access to this" })).toBeInTheDocument();
  });

  it('says which port was taken', () => {
    expect(portsLine({ https: 8443, http: 80 })).toBe('HTTP 80 · HTTPS 8443 (443 is used by another program)');
    expect(portsLine({ https: 8443, http: 8080 })).toBe(
      'HTTP 8080 · HTTPS 8443 (443 is used by another program, 80 is used by another program)',
    );
  });
});
