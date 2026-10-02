import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { SectionPage } from './section-page';
import { fakeDns } from '../test/network';

const app = (id: string, name: string, tailnet: string | null) => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet },
});
const home = {
  hostname: 'hlabs',
  localAddress: 'https://hlabs.local',
  dnsAddress: 'https://hlabs.home.arpa',
  published: true,
  lanAddresses: [],
  fallbackAddress: null,
};
const remote = (o: Record<string, unknown>) => ({
  mode: 'off',
  state: 'off',
  tailnet: null,
  nodeName: null,
  url: null,
  loginUrl: null,
  keyExpiry: null,
  ...o,
});

function open(r: Record<string, unknown>, apps: unknown[]) {
  return renderScreen(() => <SectionPage id="network" shippedPhase={3} />, {
    'auth.me': fakeMe(),
    'network.status': () => ({ home, remote: remote(r), dns: fakeDns(), ports: { https: 443, http: 80 } }),
    'apps.list': () => ({ apps }),
    'events.stream': () => new Promise(() => {}),
  });
}

describe('US-SYS-04', () => {
  it('connected: the dashboard and each app, sorted by name, on the computer’s tailnet name', async () => {
    open({ state: 'connected', mode: 'tailscale', url: 'https://hari-home.tail9.ts.net' }, [
      app('jellyfin', 'Jellyfin', 'https://hari-home.tail9.ts.net:14002'),
      app('immich', 'Immich', 'https://hari-home.tail9.ts.net:14001'),
    ]);
    const group = await screen.findByRole('group', { name: 'Remote access' });
    const links = within(group)
      .getAllByRole('link')
      .filter((l) => /ts\.net/.test(l.textContent ?? ''));
    expect(links.map((l) => l.textContent)).toEqual([
      'https://hari-home.tail9.ts.net',
      'https://hari-home.tail9.ts.net:14001',
      'https://hari-home.tail9.ts.net:14002',
    ]);
    expect(links[1]).toHaveAttribute('target', '_blank');
    expect(within(group).getAllByRole('button', { name: /Copy/ })).toHaveLength(3);
  });

  it('not connected: no tailnet addresses, only Connect', async () => {
    open({ state: 'off' }, [app('immich', 'Immich', null)]);
    const group = await screen.findByRole('group', { name: 'Remote access' });
    expect(within(group).queryByText(/ts\.net/)).toBeNull();
    expect(within(group).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });
});
