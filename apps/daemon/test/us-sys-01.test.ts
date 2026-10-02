// US-SYS-01 · See how hlabs is reached on the home network (server side): network.status, admins only, and the
// home.arpa names Caddy and forward auth answer on (D-105).
import { apps, getSetting, setSetting, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { appForHost, dashboardOrigin } from '../src/http/verify';
import { NetworkService } from '../src/network/service';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-SYS-01', () => {
  it('network.status: the .local and .home.arpa addresses, published, and the web ports', async () => {
    const d = await daemonWithAdmin(closers);
    const status = (await d.query('network.status')).result!.data;
    expect(status.home).toMatchObject({
      hostname: 'hlabs',
      localAddress: 'https://hlabs.local',
      dnsAddress: 'https://hlabs.home.arpa',
      published: true,
      fallbackAddress: null,
    });
    expect(status.ports).toEqual(getSetting(d.services!.db, 'network').ports);
  });

  it('addresses carry the HTTPS port when 443 was taken', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    setSetting(db, 'network', { ...getSetting(db, 'network'), ports: { https: 8443, http: 8080 } });
    const home = (await d.query('network.status')).result!.data.home as Record<string, string>;
    expect(home.localAddress).toBe('https://hlabs.local:8443');
    expect(home.dnsAddress).toBe('https://hlabs.home.arpa:8443');
  });

  it('when the name is not published: the LAN address to use instead, and every LAN address', async () => {
    const d = await daemonWithAdmin(closers);
    const service = new NetworkService({
      db: d.services!.db,
      proxy: {} as never,
      mdns: { isPublished: () => false, sync: async () => {} } as never,
      logger: {} as never,
      routes: () => [],
      dashboardUpstream: '',
      daemon: '',
      lanAddresses: () => ['192.168.1.20', '10.0.0.5'],
    });
    expect(service.homeNetwork()).toMatchObject({
      published: false,
      fallbackAddress: 'https://192.168.1.20',
      lanAddresses: ['192.168.1.20', '10.0.0.5'],
    });
  });

  it('members get ACCESS_DENIED', async () => {
    const d = await daemonWithAdmin(closers);
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    const res = await fetch(`${d.url}/trpc/network.status`, { headers: { cookie: d.cookie } });
    expect(res.status).toBe(403);
  });

  it('forward auth knows apps on home.arpa names, and sends people back to the dashboard on the same name', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    db.insert(apps)
      .values({ id: 'immich', version: '1', state: 'running', hostname: 'immich', installedAt: 1, updatedAt: 1 })
      .run();
    expect(appForHost(db, 'immich.hlabs.home.arpa')?.id).toBe('immich');
    expect(appForHost(db, 'immich.hlabs.local')?.id).toBe('immich');
    expect(appForHost(db, 'immich.other.home.arpa')).toBeNull();
    expect(dashboardOrigin(db, 'immich.hlabs.home.arpa')).toBe('https://hlabs.home.arpa');
    expect(dashboardOrigin(db, 'immich.hlabs.local')).toBe('https://hlabs.local');
  });
});
