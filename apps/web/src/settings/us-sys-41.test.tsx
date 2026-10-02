import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../shell/toaster';
import { fakeMe } from '../test/me';
import { fakeDns } from '../test/network';
import { renderScreen } from '../test/render';
import { SectionPage } from './section-page';
import { subnetAddresses } from './subnet-router';

const writeText = vi.fn(async () => undefined);
beforeEach(() => Object.assign(navigator, { clipboard: { writeText } }));

const home = {
  hostname: 'hlabs',
  localAddress: 'https://hlabs.local',
  dnsAddress: 'https://hlabs.home.arpa',
  published: true,
  lanAddresses: ['192.168.1.20'],
  fallbackAddress: null,
};
const remote = (mode: string, state = 'off') => ({
  mode,
  state,
  tailnet: null,
  nodeName: null,
  url: null,
  loginUrl: null,
  keyExpiry: null,
});

function open(mode = 'off', dns = fakeDns(), state = 'off') {
  return renderScreen(
    () => (
      <>
        <SectionPage id="network" shippedPhase={3} />
        <Toaster />
      </>
    ),
    {
      'auth.me': fakeMe({ role: 'admin' }),
      'network.status': () => ({ home, remote: remote(mode, state), dns, ports: { https: 443, http: 80 } }),
      'network.setRemoteMode': () => ({ ok: true }),
      'apps.list': () => ({ apps: [] }),
      'events.stream': () => new Promise(() => {}),
    },
  );
}

describe('US-SYS-41', () => {
  it('besides Connect, offers "I reach my home network through a Tailscale subnet router"', async () => {
    const { calls } = open();
    const group = await screen.findByRole('group', { name: 'Remote access' });
    expect(within(group).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(within(group).getByText('I reach my home network through a Tailscale subnet router')).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Use subnet router' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'network.setRemoteMode')?.input).toEqual({ mode: 'subnetRouter' }),
    );
  });

  it('not offered while connected with Tailscale here', async () => {
    open('tailscale', fakeDns(), 'connected');
    const group = await screen.findByRole('group', { name: 'Remote access' });
    expect(within(group).queryByRole('button', { name: 'Use subnet router' })).toBeNull();
  });

  it('this mode shows "Through your subnet router" with the LAN-IP address and Copy, and the help link', async () => {
    open('subnetRouter');
    const group = await screen.findByRole('group', { name: 'Remote access' });
    expect(within(group).getByText('Through your subnet router')).toBeInTheDocument();
    expect(within(group).getByText('https://192.168.1.20')).toBeInTheDocument();
    expect(within(group).queryByText('https://hlabs.home.arpa')).toBeNull();
    expect(within(group).queryByRole('button', { name: 'Connect' })).toBeNull();
    fireEvent.click(within(group).getByRole('button', { name: 'Copy https://192.168.1.20' }));
    expect(writeText).toHaveBeenCalledWith('https://192.168.1.20');
    expect(within(group).getByRole('link', { name: 'How to' })).toHaveAttribute(
      'href',
      expect.stringContaining('/help/remote-access/subnet-router/'),
    );
  });

  it('with a local DNS server, the home.arpa address too', async () => {
    open('subnetRouter', fakeDns({ kind: 'pihole', address: 'http://pi.lan' }));
    const group = await screen.findByRole('group', { name: 'Remote access' });
    expect(within(group).getByText('https://hlabs.home.arpa')).toBeInTheDocument();
  });

  it('"Use Tailscale on this computer instead" goes back to the Connect flow', async () => {
    const { calls } = open('subnetRouter');
    fireEvent.click(await screen.findByRole('button', { name: 'Use Tailscale on this computer instead' }));
    await waitFor(() => expect(calls.find((c) => c.path === 'network.setRemoteMode')?.input).toEqual({ mode: 'off' }));
  });

  it('addresses carry a port other than 443', () => {
    const status = { home, ports: { https: 8443, http: 80 }, dns: fakeDns({ kind: 'manual' }) };
    expect(subnetAddresses({ ...status, home: { ...home, dnsAddress: 'https://hlabs.home.arpa:8443' } })).toEqual([
      'https://192.168.1.20:8443',
      'https://hlabs.home.arpa:8443',
    ]);
    expect(subnetAddresses({ ...status, home: { ...home, lanAddresses: [] } })).toEqual(['https://hlabs.home.arpa']);
  });
});
